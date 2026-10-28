import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemKind, LinkKind, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { convertMinor, ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue, dayMs, localDate } from '../recurrence/dates';
import { TasksService } from '../tasks/tasks.service';
import { CreateTripDto, UpdateTripDto } from './dto/trips.dto';

const longestTripDays = 366;

const tripFields = {
  id: true,
  spaceId: true,
  title: true,
  trashedAt: true,
  createdAt: true,
  updatedAt: true,
  space: { select: { name: true } },
  trip: true,
} satisfies Prisma.ItemSelect;

type TripRow = Prisma.ItemGetPayload<{ select: typeof tripFields }>;

function present(row: TripRow, today: string) {
  const trip = row.trip!;
  const startsOn = dateText(trip.startsOn);
  const endsOn = dateText(trip.endsOn);
  return {
    id: row.id,
    spaceId: row.spaceId,
    spaceName: row.space.name,
    title: row.title,
    destination: trip.destination,
    startsOn,
    endsOn,
    budgetMinor: trip.budgetMinor,
    currency: trip.currency,
    when: endsOn < today ? ('past' as const) : startsOn > today ? ('upcoming' as const) : ('now' as const),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function checkedDates(startsOn: string, endsOn: string) {
  if (endsOn < startsOn) throw new BadRequestException('A trip cannot end before it starts');
  if ((dateValue(endsOn).getTime() - dateValue(startsOn).getTime()) / dayMs >= longestTripDays) throw new BadRequestException('Trips can last at most a year');
}

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly tasks: TasksService,
    private readonly rates: ExchangeRatesService,
  ) {}

  async list(userId: string, spaceId?: string) {
    const today = await this.today(userId);
    const rows = await this.prisma.item.findMany({
      where: { ...this.access.itemsOf(userId), ...(spaceId ? { spaceId } : {}), kind: ItemKind.TRIP, trashedAt: null },
      orderBy: [{ trip: { startsOn: 'asc' } }, { createdAt: 'asc' }],
      take: 1_000,
      select: tripFields,
    });
    return rows.map((row) => present(row, today));
  }

  async create(userId: string, spaceId: string, input: CreateTripDto) {
    await this.access.assertSpace(userId, spaceId, 'edit');
    checkedDates(input.startsOn, input.endsOn);
    const id = await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.item.create({
        data: {
          spaceId,
          kind: ItemKind.TRIP,
          title: input.title,
          createdById: userId,
          updatedById: userId,
          trip: {
            create: {
              destination: input.destination ?? '',
              startsOn: dateValue(input.startsOn),
              endsOn: dateValue(input.endsOn),
              budgetMinor: input.budgetMinor ?? null,
              currency: input.currency ?? null,
            },
          },
        },
        select: { id: true },
      });
      const packing = await transaction.item.create({
        data: { spaceId, kind: ItemKind.LIST, title: `Packing for ${input.title}`.slice(0, 100), createdById: userId, updatedById: userId },
        select: { id: true },
      });
      await transaction.itemLink.create({ data: { sourceItemId: item.id, targetItemId: packing.id, kind: LinkKind.REFERENCE, createdById: userId } });
      await this.activity.record(transaction, { spaceId, actorId: userId, itemId: item.id, verb: 'item.created', data: { title: input.title } });
      return item.id;
    });
    return this.get(userId, id);
  }

  async get(userId: string, itemId: string) {
    const row = await this.row(userId, itemId, 'read');
    const [user, links, rates] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true, homeCurrency: true } }),
      this.prisma.itemLink.findMany({
        where: { sourceItemId: itemId, target: { ...this.access.itemsOf(userId), trashedAt: null } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          target: {
            select: { id: true, kind: true, title: true, event: true, expense: true, file: { select: { mimeType: true, sizeBytes: true } } },
          },
        },
      }),
      this.rates.table(),
    ]);
    const of = (kind: ItemKind) => links.filter((link) => link.target.kind === kind);
    const packingList = of(ItemKind.LIST)[0]?.target;
    const packingIds = packingList
      ? (await this.prisma.task.findMany({ where: { listId: packingList.id, item: { trashedAt: null } }, select: { itemId: true } })).map((task) => task.itemId)
      : [];
    const currency = row.trip!.currency ?? user.homeCurrency ?? 'EUR';
    const missing = new Set<string>();
    const expenses = of(ItemKind.EXPENSE).map(({ id, target }) => ({
      linkId: id,
      id: target.id,
      title: target.title,
      amountMinor: Number(target.expense!.amountMinor),
      currency: target.expense!.currency,
      spentOn: dateText(target.expense!.spentOn),
      category: target.expense!.category,
    }));
    const spentMinor = expenses.reduce((sum, expense) => {
      const converted = expense.currency === currency ? expense.amountMinor : convertMinor(expense.amountMinor, expense.currency, currency, rates.rates);
      if (converted === null) missing.add(expense.currency);
      return sum + (converted ?? 0);
    }, 0);
    return {
      ...present(row, localDate(user.timeZone)),
      itinerary: of(ItemKind.EVENT)
        .map(({ id, target }) => ({
          linkId: id,
          id: target.id,
          title: target.title,
          startsOn: dateText(target.event!.startsOn),
          startTime: target.event!.startTime,
          endsOn: dateText(target.event!.endsOn),
          endTime: target.event!.endTime,
          location: target.event!.location,
        }))
        .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || (a.startTime ?? '').localeCompare(b.startTime ?? '')),
      packing: packingList ? { id: packingList.id, title: packingList.title, tasks: await this.tasks.visible(userId, packingIds) } : null,
      documents: of(ItemKind.FILE).map(({ id, target }) => ({ linkId: id, id: target.id, title: target.title, mimeType: target.file?.mimeType ?? null, sizeBytes: target.file?.sizeBytes ?? null })),
      pages: of(ItemKind.NOTE).map(({ id, target }) => ({ linkId: id, id: target.id, title: target.title })),
      expenses: expenses.sort((a, b) => b.spentOn.localeCompare(a.spentOn)),
      spending: { currency, spentMinor, missing: [...missing].sort() },
    };
  }

  async update(userId: string, itemId: string, input: UpdateTripDto) {
    const row = await this.row(userId, itemId, 'edit');
    if (row.trashedAt) throw new BadRequestException('Restore this trip from the trash before changing it');
    checkedDates(input.startsOn ?? dateText(row.trip!.startsOn), input.endsOn ?? dateText(row.trip!.endsOn));
    await this.prisma.$transaction(async (transaction) => {
      await transaction.item.update({
        where: { id: itemId },
        data: {
          title: input.title,
          updatedById: userId,
          trip: {
            update: {
              destination: input.destination,
              startsOn: input.startsOn ? dateValue(input.startsOn) : undefined,
              endsOn: input.endsOn ? dateValue(input.endsOn) : undefined,
              budgetMinor: input.budgetMinor,
              currency: input.currency,
            },
          },
        },
      });
      await this.activity.record(transaction, { spaceId: row.spaceId, actorId: userId, itemId, verb: 'item.updated', data: { title: input.title ?? row.title } });
    });
    return this.get(userId, itemId);
  }

  private async row(userId: string, itemId: string, access: 'read' | 'edit') {
    await this.access.assertItem(userId, itemId, access);
    const row = await this.prisma.item.findUniqueOrThrow({ where: { id: itemId }, select: tripFields });
    if (!row.trip) throw new NotFoundException('That item is not a trip');
    return row;
  }

  private async today(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
    return localDate(user.timeZone);
  }
}
