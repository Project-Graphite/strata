import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Asset, SavingsGoal } from '@prisma/client';
import { ChangesService } from '../changes/changes.service';
import { convertMinor, ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue } from '../recurrence/dates';
import { AccountsService } from './accounts.service';
import { AddToGoalDto, CreateAssetDto, CreateSavingsGoalDto, UpdateAssetDto, UpdateSavingsGoalDto } from './dto/wealth.dto';

const optionalDay = (day: string | null | undefined) => (day === undefined ? undefined : day === null ? null : dateValue(day));

const presentAsset = (asset: Asset) => ({
  id: asset.id,
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
    private readonly accounts: AccountsService,
    private readonly rates: ExchangeRatesService,
    private readonly changes: ChangesService,
  ) {}

  async goals(userId: string) {
    return this.present(await this.prisma.savingsGoal.findMany({ where: { userId }, orderBy: [{ dueOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }] }));
  }

  async createGoal(userId: string, input: CreateSavingsGoalDto) {
    await this.assertAccount(userId, input.accountId);
    const goal = await this.prisma.savingsGoal.create({ data: { userId, ...input, dueOn: optionalDay(input.dueOn), accountId: input.accountId ?? null } });
    this.changes.notify('spending', { userId });
    return (await this.present([goal]))[0]!;
  }

  async updateGoal(userId: string, id: string, input: UpdateSavingsGoalDto) {
    await this.goal(userId, id);
    await this.assertAccount(userId, input.accountId);
    const updated = await this.prisma.savingsGoal.update({ where: { id }, data: { ...input, dueOn: optionalDay(input.dueOn) } });
    this.changes.notify('spending', { userId });
    return (await this.present([updated]))[0]!;
  }

  async addToGoal(userId: string, id: string, input: AddToGoalDto) {
    const goal = await this.goal(userId, id);
    if (goal.accountId) throw new BadRequestException('This goal follows its account balance');
    if (Number(goal.savedMinor) + input.amountMinor < 0) throw new BadRequestException('A goal cannot go below zero');
    const updated = await this.prisma.savingsGoal.update({ where: { id }, data: { savedMinor: { increment: input.amountMinor } } });
    this.changes.notify('spending', { userId });
    return (await this.present([updated]))[0]!;
  }

  async removeGoal(userId: string, id: string) {
    const goal = await this.goal(userId, id);
    await this.prisma.savingsGoal.delete({ where: { id: goal.id } });
    this.changes.notify('spending', { userId });
  }

  async netWorth(userId: string) {
    const [user, plan, accounts, assets, installments, rates] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeCurrency: true } }),
      this.prisma.spendingPlan.findUnique({ where: { userId }, select: { currency: true } }),
      this.prisma.moneyAccount.findMany({ where: { userId } }).then((rows) => this.accounts.balances(rows)),
      this.prisma.asset.findMany({ where: { userId }, orderBy: [{ valueMinor: 'desc' }, { name: 'asc' }] }),
      this.prisma.installmentPlan.findMany({ where: { userId } }),
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

  async createAsset(userId: string, input: CreateAssetDto) {
    const asset = await this.prisma.asset.create({ data: { userId, ...input, maturesOn: optionalDay(input.maturesOn) } });
    this.changes.notify('spending', { userId });
    return presentAsset(asset);
  }

  async updateAsset(userId: string, id: string, input: UpdateAssetDto) {
    await this.asset(userId, id);
    const updated = await this.prisma.asset.update({ where: { id }, data: { ...input, maturesOn: optionalDay(input.maturesOn) } });
    this.changes.notify('spending', { userId });
    return presentAsset(updated);
  }

  async removeAsset(userId: string, id: string) {
    const asset = await this.asset(userId, id);
    await this.prisma.asset.delete({ where: { id: asset.id } });
    this.changes.notify('spending', { userId });
  }

  private async present(goals: SavingsGoal[]) {
    const linked = await this.prisma.moneyAccount.findMany({ where: { id: { in: goals.flatMap((goal) => (goal.accountId ? [goal.accountId] : [])) } } });
    const [balances, rates] = await Promise.all([this.accounts.balances(linked), this.rates.table()]);
    return goals.map((goal) => {
      const account = balances.find((candidate) => candidate.id === goal.accountId);
      const savedMinor = account ? (account.currency === goal.currency ? account.balanceMinor : convertMinor(account.balanceMinor, account.currency, goal.currency, rates.rates)) : Number(goal.savedMinor);
      return {
        id: goal.id,
        accountId: goal.accountId,
        name: goal.name,
        currency: goal.currency,
        targetMinor: Number(goal.targetMinor),
        savedMinor,
        dueOn: dateText(goal.dueOn),
      };
    });
  }

  private async assertAccount(userId: string, accountId: string | null | undefined) {
    if (accountId && !(await this.prisma.moneyAccount.count({ where: { id: accountId, userId } }))) throw new BadRequestException('Choose one of your accounts');
  }

  private async goal(userId: string, id: string) {
    const goal = await this.prisma.savingsGoal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }

  private async asset(userId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, userId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }
}
