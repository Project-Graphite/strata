import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Merchant, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantRuleDto, SaveCategoriesDto, UpdateMerchantRuleDto } from './dto/categories.dto';

export const defaultCategories = [
  { name: 'groceries', colour: 'green', icon: 'checklist', kind: 'expense' },
  { name: 'eating out', colour: 'orange', icon: 'utensils', kind: 'expense' },
  { name: 'transport', colour: 'blue', icon: 'compass', kind: 'expense' },
  { name: 'housing', colour: 'purple', icon: 'home', kind: 'expense' },
  { name: 'utilities', colour: 'yellow', icon: 'repeat', kind: 'expense' },
  { name: 'health', colour: 'red', icon: 'shield', kind: 'expense' },
  { name: 'shopping', colour: 'pink', icon: 'tag', kind: 'expense' },
  { name: 'entertainment', colour: 'teal', icon: 'gamepad', kind: 'expense' },
  { name: 'travel', colour: 'blue', icon: 'plane', kind: 'expense' },
  { name: 'gifts', colour: 'pink', icon: 'gift', kind: 'expense' },
  { name: 'education', colour: 'purple', icon: 'library', kind: 'expense' },
  { name: 'other', colour: 'gray', icon: 'more', kind: 'expense' },
  { name: 'salary', colour: 'green', icon: 'wallet', kind: 'income' },
  { name: 'refund', colour: 'teal', icon: 'undo', kind: 'income' },
  { name: 'other income', colour: 'gray', icon: 'plus', kind: 'income' },
];

type Client = PrismaService | Prisma.TransactionClient;

export const merchantFor = <T extends Pick<Merchant, 'aliases'>>(merchants: T[], text: string) =>
  merchants
    .flatMap((merchant) => merchant.aliases.filter((alias) => text.toLowerCase().includes(alias.toLowerCase())).map((alias) => ({ merchant, length: alias.length })))
    .sort((a, b) => b.length - a.length)[0]?.merchant ?? null;

export const renameOf = (merchant: Pick<Merchant, 'name' | 'aliases'>) => (merchant.aliases.includes(merchant.name) ? null : merchant.name);

const presentRule = (merchant: Merchant) => ({ id: merchant.id, match: merchant.aliases[0] ?? merchant.name, rename: renameOf(merchant), category: merchant.category, ignore: merchant.ignore });

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async categories(userId: string, client: Client = this.prisma) {
    const rows = await client.spendingCategory.findMany({ where: { userId }, orderBy: { position: 'asc' }, select: { name: true, colour: true, icon: true, kind: true } });
    return rows.length ? rows : defaultCategories;
  }

  async assertCategory(userId: string, category: string | null | undefined) {
    if (!category) return;
    if (!(await this.categories(userId)).some((known) => known.name === category)) throw new BadRequestException('Choose a category from the list');
  }

  async list(userId: string) {
    const [categories, counts] = await Promise.all([
      this.categories(userId),
      this.prisma.expense.groupBy({ by: ['category'], where: { userId, trashedAt: null, direction: { in: ['spent', 'refund'] } }, _count: { _all: true } }),
    ]);
    return categories.map((category) => ({ ...category, uses: counts.find((count) => count.category === category.name)?._count._all ?? 0 }));
  }

  async save(userId: string, input: SaveCategoriesDto) {
    const names = input.categories.map((category) => category.name);
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new BadRequestException('Give each category a different name');
    if (!names.includes('other') || input.categories.some((category) => category.previous === 'other' && category.name !== 'other')) {
      throw new BadRequestException('Keep the Other category');
    }
    await this.prisma.$transaction(async (transaction) => {
      const existing = await this.categories(userId, transaction);
      const current = existing.map((category) => category.name);
      const renamed = input.categories.filter((category) => category.previous && category.previous !== category.name && current.includes(category.previous));
      const kept = new Set([...names, ...renamed.map((category) => category.previous!)]);
      const removed = current.filter((name) => !kept.has(name));
      const recategorise = async (from: string, to: string | null) => {
        await transaction.expense.updateMany({ where: { userId, category: from }, data: { category: to ?? 'other' } });
        await transaction.merchant.updateMany({ where: { userId, category: from }, data: { category: to } });
        if (to) await transaction.budget.updateMany({ where: { userId, category: from }, data: { category: to } });
        else await transaction.budget.deleteMany({ where: { userId, category: from } });
      };
      for (const name of removed) await recategorise(name, null);
      for (const [index, category] of renamed.entries()) await recategorise(category.previous!, `renaming ${index}`);
      for (const [index, category] of renamed.entries()) await recategorise(`renaming ${index}`, category.name);
      await transaction.spendingCategory.deleteMany({ where: { userId } });
      await transaction.spendingCategory.createMany({
        data: input.categories.map(({ name, colour, icon, kind, previous }, position) => {
          const was = existing.find((category) => category.name === (previous ?? name));
          return { userId, name, colour, icon: icon ?? was?.icon ?? null, kind: kind ?? was?.kind ?? 'expense', position };
        }),
      });
    });
    return this.categories(userId);
  }

  async rules(userId: string) {
    const merchants = await this.prisma.merchant.findMany({ where: { userId } });
    return merchants.map(presentRule).sort((a, b) => a.match.localeCompare(b.match));
  }

  async saveRule(userId: string, input: CreateMerchantRuleDto) {
    await this.assertCategory(userId, input.category);
    const data = { name: input.rename ?? input.match, category: input.category ?? null, ignore: input.ignore ?? false };
    const known = await this.prisma.merchant.findFirst({ where: { userId, aliases: { has: input.match } }, select: { id: true } });
    return presentRule(
      known
        ? await this.prisma.merchant.update({ where: { id: known.id }, data })
        : await this.prisma.merchant.create({ data: { userId, aliases: [input.match], ...data } }),
    );
  }

  async updateRule(userId: string, id: string, input: UpdateMerchantRuleDto) {
    const merchant = await this.ownRule(userId, id);
    await this.assertCategory(userId, input.category);
    const name = input.rename === undefined ? undefined : (input.rename ?? merchant.aliases[0] ?? merchant.name);
    return presentRule(await this.prisma.merchant.update({ where: { id }, data: { name, category: input.category, ignore: input.ignore } }));
  }

  async removeRule(userId: string, id: string) {
    await this.ownRule(userId, id);
    await this.prisma.merchant.delete({ where: { id } });
  }

  private async ownRule(userId: string, id: string) {
    const merchant = await this.prisma.merchant.findFirst({ where: { id, userId } });
    if (!merchant) throw new NotFoundException('Rule not found');
    return merchant;
  }
}
