import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Asset, SavingsGoal } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ChangesService } from '../changes/changes.service';
import { convertMinor, ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue } from '../recurrence/dates';
import { AccountsService } from './accounts.service';
import { AddToGoalDto, CreateAssetDto, CreateSavingsGoalDto, UpdateAssetDto, UpdateSavingsGoalDto } from './dto/wealth.dto';

const optionalDay = (day: string | null | undefined) => (day === undefined ? undefined : day === null ? null : dateValue(day));

const presentAsset = (asset: Asset) => ({
  id: asset.id,
  spaceId: asset.spaceId,
  name: asset.name,
  kind: asset.kind,
  currency: asset.currency,
  valueMinor: Number(asset.valueMinor),
  ratePercent: asset.ratePercent,
  maturesOn: dateText(asset.maturesOn),
  updatedAt: asset.updatedAt,
});

@Injectable()
export class WealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly accounts: AccountsService,
    private readonly rates: ExchangeRatesService,
    private readonly changes: ChangesService,
  ) {}

  async goals(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    return this.present(await this.prisma.savingsGoal.findMany({ where: { spaceId }, orderBy: [{ dueOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }] }));
  }

  async createGoal(userId: string, spaceId: string, input: CreateSavingsGoalDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.assertAccount(spaceId, input.accountId);
    const goal = await this.prisma.savingsGoal.create({ data: { spaceId, ...input, dueOn: optionalDay(input.dueOn), accountId: input.accountId ?? null } });
    this.changes.notify('spending', { spaceId });
    return (await this.present([goal]))[0]!;
  }

  async updateGoal(userId: string, id: string, input: UpdateSavingsGoalDto) {
    const goal = await this.goal(userId, id);
    await this.assertAccount(goal.spaceId, input.accountId);
    const updated = await this.prisma.savingsGoal.update({ where: { id }, data: { ...input, dueOn: optionalDay(input.dueOn) } });
    this.changes.notify('spending', { spaceId: goal.spaceId });
    return (await this.present([updated]))[0]!;
  }

  async addToGoal(userId: string, id: string, input: AddToGoalDto) {
    const goal = await this.goal(userId, id);
    if (goal.accountId) throw new BadRequestException('This goal follows its account balance');
    if (Number(goal.savedMinor) + input.amountMinor < 0) throw new BadRequestException('A goal cannot go below zero');
    const updated = await this.prisma.savingsGoal.update({ where: { id }, data: { savedMinor: { increment: input.amountMinor } } });
    this.changes.notify('spending', { spaceId: goal.spaceId });
    return (await this.present([updated]))[0]!;
  }

  async removeGoal(userId: string, id: string) {
    const goal = await this.goal(userId, id);
    await this.prisma.savingsGoal.delete({ where: { id: goal.id } });
    this.changes.notify('spending', { spaceId: goal.spaceId });
  }

  async netWorth(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const [user, plan, accounts, assets, installments, rates] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeCurrency: true } }),
      this.prisma.spendingPlan.findUnique({ where: { spaceId }, select: { currency: true } }),
      this.prisma.moneyAccount.findMany({ where: { spaceId } }).then((rows) => this.accounts.balances(rows)),
      this.prisma.asset.findMany({ where: { spaceId }, orderBy: [{ valueMinor: 'desc' }, { name: 'asc' }] }),
      this.prisma.installmentPlan.findMany({ where: { spaceId } }),
      this.rates.table(),
    ]);
    const currency = user.homeCurrency ?? plan?.currency ?? accounts[0]?.currency ?? assets[0]?.currency ?? 'EGP';
    const missing = new Set<string>();
    const total = (rows: { amountMinor: number | bigint; currency: string }[]) =>
      rows.reduce((sum, row) => {
        const converted = row.currency === currency ? Number(row.amountMinor) : convertMinor(Number(row.amountMinor), row.currency, currency, rates.rates);
        if (converted === null) missing.add(row.currency);
        return sum + (converted ?? 0);
      }, 0);
    const accountsMinor = total(accounts.map((account) => ({ amountMinor: account.balanceMinor, currency: account.currency })));
    const assetsMinor = total(assets.map((asset) => ({ amountMinor: asset.valueMinor, currency: asset.currency })));
    const installmentsMinor = total(installments.map((plan) => ({ amountMinor: Number(plan.monthlyMinor) * (plan.count - plan.paidCount), currency: plan.currency })));
    return {
      currency,
      missing: [...missing].sort(),
      accountsMinor,
      assetsMinor,
      installmentsMinor,
      totalMinor: accountsMinor + assetsMinor - installmentsMinor,
      assets: assets.map(presentAsset),
    };
  }

  async createAsset(userId: string, spaceId: string, input: CreateAssetDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const asset = await this.prisma.asset.create({ data: { spaceId, ...input, maturesOn: optionalDay(input.maturesOn) } });
    this.changes.notify('spending', { spaceId });
    return presentAsset(asset);
  }

  async updateAsset(userId: string, id: string, input: UpdateAssetDto) {
    const asset = await this.asset(userId, id);
    const updated = await this.prisma.asset.update({ where: { id }, data: { ...input, maturesOn: optionalDay(input.maturesOn) } });
    this.changes.notify('spending', { spaceId: asset.spaceId });
    return presentAsset(updated);
  }

  async removeAsset(userId: string, id: string) {
    const asset = await this.asset(userId, id);
    await this.prisma.asset.delete({ where: { id: asset.id } });
    this.changes.notify('spending', { spaceId: asset.spaceId });
  }

  private async present(goals: SavingsGoal[]) {
    const linked = await this.prisma.moneyAccount.findMany({ where: { id: { in: goals.flatMap((goal) => (goal.accountId ? [goal.accountId] : [])) } } });
    const [balances, rates] = await Promise.all([this.accounts.balances(linked), this.rates.table()]);
    return goals.map((goal) => {
      const account = balances.find((candidate) => candidate.id === goal.accountId);
      const savedMinor = account ? (account.currency === goal.currency ? account.balanceMinor : convertMinor(account.balanceMinor, account.currency, goal.currency, rates.rates)) : Number(goal.savedMinor);
      return {
        id: goal.id,
        spaceId: goal.spaceId,
        accountId: goal.accountId,
        name: goal.name,
        currency: goal.currency,
        targetMinor: Number(goal.targetMinor),
        savedMinor,
        dueOn: dateText(goal.dueOn),
      };
    });
  }

  private async assertAccount(spaceId: string, accountId: string | null | undefined) {
    if (accountId && !(await this.prisma.moneyAccount.count({ where: { id: accountId, spaceId } }))) throw new BadRequestException('Choose an account from this space');
  }

  private async goal(userId: string, id: string) {
    const goal = await this.prisma.savingsGoal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Goal not found');
    await this.access.assertPersonalSpace(userId, goal.spaceId);
    return goal;
  }

  private async asset(userId: string, id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found');
    await this.access.assertPersonalSpace(userId, asset.spaceId);
    return asset;
  }
}
