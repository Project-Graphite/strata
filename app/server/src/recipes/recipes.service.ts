import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ChangesService } from '../changes/changes.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs } from '../recurrence/dates';
import { TasksService } from '../tasks/tasks.service';
import { fetchPublic } from '../widgets/safe-fetch';
import { CreateMealDto, CreateRecipeDto, ShoppingListDto, UpdateRecipeDto } from './dto/recipes.dto';
import { readRecipe } from './recipe-page';

const shoppingListTitle = 'Shopping';

const recipeFields = {
  id: true,
  title: true,
  trashedAt: true,
  createdAt: true,
  updatedAt: true,
  recipe: true,
} satisfies Prisma.ItemSelect;

type RecipeRow = Prisma.ItemGetPayload<{ select: typeof recipeFields }>;

const mealFields = { id: true, day: true, meal: true, note: true, recipe: { select: { id: true, title: true, trashedAt: true } } } satisfies Prisma.MealPlanEntrySelect;

function presentMeal(entry: Prisma.MealPlanEntryGetPayload<{ select: typeof mealFields }>) {
  return {
    id: entry.id,
    day: dateText(entry.day),
    meal: entry.meal,
    note: entry.note,
    recipe: entry.recipe && !entry.recipe.trashedAt ? { id: entry.recipe.id, title: entry.recipe.title } : null,
  };
}

const lines = (value: string[] | undefined) => value?.map((line) => line.trim()).filter(Boolean);

function present(row: RecipeRow) {
  const recipe = row.recipe!;
  return {
    id: row.id,
    title: row.title,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    ingredients: recipe.ingredients as string[],
    steps: recipe.steps as string[],
    sourceUrl: recipe.sourceUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly changes: ChangesService,
    private readonly tasks: TasksService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.item.findMany({
      where: { ...this.access.ownedBy(userId), kind: ItemKind.RECIPE, trashedAt: null },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      take: 2_000,
      select: recipeFields,
    });
    return rows.map(present);
  }

  async create(userId: string, input: CreateRecipeDto) {
    const item = await this.prisma.item.create({
      data: {
        ownerId: userId,
        kind: ItemKind.RECIPE,
        title: input.title,
        createdById: userId,
        updatedById: userId,
        recipe: {
          create: {
            servings: input.servings ?? null,
            prepMinutes: input.prepMinutes ?? null,
            cookMinutes: input.cookMinutes ?? null,
            ingredients: lines(input.ingredients) ?? [],
            steps: lines(input.steps) ?? [],
            sourceUrl: input.sourceUrl || null,
          },
        },
      },
      select: { id: true },
    });
    this.changes.notify('items', { userId });
    return this.get(userId, item.id);
  }

  async get(userId: string, itemId: string) {
    return present(await this.row(userId, itemId, 'read'));
  }

  async update(userId: string, itemId: string, input: UpdateRecipeDto) {
    const row = await this.row(userId, itemId, 'edit');
    if (row.trashedAt) throw new BadRequestException('Restore this recipe from the trash before changing it');
    await this.prisma.item.update({
      where: { id: itemId },
      data: {
        title: input.title,
        updatedById: userId,
        recipe: {
          update: {
            servings: input.servings,
            prepMinutes: input.prepMinutes,
            cookMinutes: input.cookMinutes,
            ingredients: lines(input.ingredients),
            steps: lines(input.steps),
            sourceUrl: input.sourceUrl === undefined ? undefined : input.sourceUrl || null,
          },
        },
      },
    });
    this.changes.notify('items', { userId });
    return this.get(userId, itemId);
  }

  async importPage(url: string) {
    let html: string;
    try {
      html = await fetchPublic(url, { accept: 'text/html, application/xhtml+xml;q=0.9', maxBytes: 3_000_000, timeoutMs: 10_000 });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'The page could not be fetched');
    }
    const draft = readRecipe(html);
    if (!draft) throw new BadRequestException('That page does not describe its recipe in a way Strata can read. Add it by hand instead.');
    return { ...draft, sourceUrl: url };
  }

  async week(userId: string, from: string) {
    const start = dateValue(from);
    const entries = await this.prisma.mealPlanEntry.findMany({
      where: { userId, day: { gte: start, lt: new Date(start.getTime() + 7 * dayMs) } },
      orderBy: [{ day: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      select: mealFields,
    });
    return entries.map(presentMeal);
  }

  async addMeal(userId: string, input: CreateMealDto) {
    if (!input.recipeId && !input.note) throw new BadRequestException('Choose a recipe or write what you will eat');
    if (input.recipeId) {
      const recipe = await this.prisma.item.count({ where: { id: input.recipeId, ownerId: userId, kind: ItemKind.RECIPE, trashedAt: null } });
      if (!recipe) throw new BadRequestException('Choose one of your recipes');
    }
    const day = dateValue(input.day);
    const position = await this.prisma.mealPlanEntry.count({ where: { userId, day, meal: input.meal } });
    return presentMeal(
      await this.prisma.mealPlanEntry.create({
        data: { userId, day, meal: input.meal, recipeId: input.recipeId ?? null, note: input.note ?? '', position },
        select: mealFields,
      }),
    );
  }

  async removeMeal(userId: string, entryId: string) {
    const { count } = await this.prisma.mealPlanEntry.deleteMany({ where: { id: entryId, userId } });
    if (count === 0) throw new NotFoundException('That meal is already gone');
  }

  async shoppingList(userId: string, input: ShoppingListDto) {
    const spaceId = input.spaceId ?? (await this.prisma.space.findFirstOrThrow({ where: { personalOwnerId: userId }, select: { id: true } })).id;
    await this.access.assertSpace(userId, spaceId, 'edit');
    const start = dateValue(input.from);
    const planned = await this.prisma.mealPlanEntry.findMany({
      where: { userId, day: { gte: start, lt: new Date(start.getTime() + 7 * dayMs) }, recipe: { trashedAt: null } },
      select: { recipe: { select: { recipe: { select: { ingredients: true } } } } },
    });
    const wanted: string[] = [];
    for (const line of planned.flatMap((entry) => (entry.recipe?.recipe?.ingredients ?? []) as string[])) {
      if (!wanted.some((kept) => kept.toLowerCase() === line.toLowerCase())) wanted.push(line);
    }
    if (wanted.length === 0) throw new BadRequestException('Plan meals with recipes this week before making a shopping list');
    const list = (await this.tasks.lists(userId, spaceId)).find((candidate) => candidate.title === shoppingListTitle) ?? (await this.tasks.createList(userId, spaceId, { title: shoppingListTitle }));
    const open = await this.prisma.item.findMany({
      where: { spaceId, kind: ItemKind.TASK, trashedAt: null, task: { listId: list.id, completedAt: null } },
      select: { title: true },
    });
    const have = new Set(open.map((task) => task.title.toLowerCase()));
    const added = wanted.filter((line) => !have.has(line.toLowerCase()));
    for (const title of added) await this.tasks.create(userId, spaceId, { title: title.slice(0, 200), listId: list.id });
    return { listId: list.id, spaceId, added: added.length, already: wanted.length - added.length };
  }

  private async row(userId: string, itemId: string, access: 'read' | 'edit') {
    await this.access.assertItem(userId, itemId, access);
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: recipeFields });
    if (!row.recipe) throw new NotFoundException('That item is not a recipe');
    return row;
  }
}
