import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantRuleDto, SaveCategoriesDto } from './dto/categories.dto';

export const defaultCategories = [
  { name: 'groceries', colour: 'green' },
  { name: 'eating out', colour: 'orange' },
  { name: 'transport', colour: 'blue' },
  { name: 'housing', colour: 'purple' },
  { name: 'utilities', colour: 'yellow' },
  { name: 'health', colour: 'red' },
  { name: 'shopping', colour: 'pink' },
  { name: 'entertainment', colour: 'teal' },
  { name: 'travel', colour: 'blue' },
  { name: 'gifts', colour: 'pink' },
  { name: 'education', colour: 'purple' },
  { name: 'other', colour: 'gray' },
];

type Client = PrismaService | Prisma.TransactionClient;

export interface MerchantRuleRow {
  match: string;
  rename: string | null;
  category: string | null;
  ignore: boolean;
}

export const ruleFor = (rules: MerchantRuleRow[], merchant: string) =>
  rules.filter((rule) => merchant.toLowerCase().includes(rule.match.toLowerCase())).sort((a, b) => b.match.length - a.match.length)[0] ?? null;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async categories(spaceId: string, client: Client = this.prisma) {
    const rows = await client.spendingCategory.findMany({ where: { spaceId }, orderBy: { position: 'asc' }, select: { name: true, colour: true } });
    return rows.length ? rows : defaultCategories;
  }

  async assertCategory(spaceId: string, category: string | null | undefined) {
    if (!category) return;
    if (!(await this.categories(spaceId)).some((known) => known.name === category)) throw new BadRequestException('Choose a category from the list');
  }

  async list(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    const [categories, counts] = await Promise.all([
      this.categories(spaceId),
      this.prisma.expense.groupBy({ by: ['category'], where: { item: { spaceId, trashedAt: null }, direction: { in: ['spent', 'refund'] } }, _count: { _all: true } }),
    ]);
    return categories.map((category) => ({ ...category, uses: counts.find((count) => count.category === category.name)?._count._all ?? 0 }));
  }

  async save(userId: string, spaceId: string, input: SaveCategoriesDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    const names = input.categories.map((category) => category.name);
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new BadRequestException('Give each category a different name');
    if (!names.includes('other') || input.categories.some((category) => category.previous === 'other' && category.name !== 'other')) {
      throw new BadRequestException('Keep the Other category');
    }
    await this.prisma.$transaction(async (transaction) => {
      const current = (await this.categories(spaceId, transaction)).map((category) => category.name);
      const renamed = input.categories.filter((category) => category.previous && category.previous !== category.name && current.includes(category.previous));
      const kept = new Set([...names, ...renamed.map((category) => category.previous!)]);
      const removed = current.filter((name) => !kept.has(name));
      const recategorise = async (from: string, to: string | null) => {
        await transaction.expense.updateMany({ where: { category: from, item: { spaceId } }, data: { category: to ?? 'other' } });
        await transaction.merchantRule.updateMany({ where: { spaceId, category: from }, data: { category: to } });
        if (to) await transaction.budget.updateMany({ where: { spaceId, category: from }, data: { category: to } });
        else await transaction.budget.deleteMany({ where: { spaceId, category: from } });
      };
      for (const name of removed) await recategorise(name, null);
      for (const [index, category] of renamed.entries()) await recategorise(category.previous!, `renaming ${index}`);
      for (const [index, category] of renamed.entries()) await recategorise(`renaming ${index}`, category.name);
      await transaction.spendingCategory.deleteMany({ where: { spaceId } });
      await transaction.spendingCategory.createMany({ data: input.categories.map(({ name, colour }, position) => ({ spaceId, name, colour, position })) });
    });
    return this.categories(spaceId);
  }

  async rules(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'read');
    return this.prisma.merchantRule.findMany({ where: { spaceId }, orderBy: { match: 'asc' }, select: { id: true, match: true, rename: true, category: true, ignore: true } });
  }

  async saveRule(userId: string, spaceId: string, input: CreateMerchantRuleDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    await this.assertCategory(spaceId, input.category);
    const data = { rename: input.rename ?? null, category: input.category ?? null, ignore: input.ignore ?? false };
    return this.prisma.merchantRule.upsert({
      where: { spaceId_match: { spaceId, match: input.match } },
      create: { spaceId, match: input.match, ...data },
      update: data,
      select: { id: true, match: true, rename: true, category: true, ignore: true },
    });
  }

  async removeRule(userId: string, id: string) {
    const rule = await this.prisma.merchantRule.findUnique({ where: { id }, select: { spaceId: true } });
    if (!rule) throw new NotFoundException('Rule not found');
    await this.access.assertSpace(userId, rule.spaceId, 'edit');
    await this.prisma.merchantRule.delete({ where: { id } });
  }
}
