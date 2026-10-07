import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GuestResponse, Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { linkTokenHash } from '../crypto/link-token';
import { PrismaService } from '../prisma/prisma.service';
import { dateText, dateValue } from '../recurrence/dates';
import { SetPollDto } from './dto/events.dto';
import { EventsService } from './events.service';

const answers = { yes: GuestResponse.YES, maybe: GuestResponse.MAYBE, no: GuestResponse.NO };

const optionFields = {
  id: true,
  startsOn: true,
  startTime: true,
  votes: { select: { answer: true, userId: true, guestId: true, user: { select: { displayName: true } }, guest: { select: { name: true } } } },
} satisfies Prisma.EventPollOptionSelect;

type OptionRow = Prisma.EventPollOptionGetPayload<{ select: typeof optionFields }>;
type Voter = { userId: string } | { guestId: string };

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const optionKey = (startsOn: string, startTime: string | null | undefined) => `${startsOn} ${startTime ?? ''}`;

function tally(option: OptionRow, mine: OptionRow['votes'][number] | undefined) {
  const count = (answer: GuestResponse) => option.votes.filter((vote) => vote.answer === answer).length;
  return {
    id: option.id,
    startsOn: dateText(option.startsOn),
    startTime: option.startTime,
    yes: count(GuestResponse.YES),
    maybe: count(GuestResponse.MAYBE),
    no: count(GuestResponse.NO),
    mine: mine?.answer.toLowerCase() ?? null,
  };
}

@Injectable()
export class DatePollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly events: EventsService,
  ) {}

  async forMember(userId: string, itemId: string) {
    await this.access.assertItem(userId, itemId, 'read');
    return {
      options: (await this.options(itemId)).map((option) => ({
        ...tally(
          option,
          option.votes.find((vote) => vote.userId === userId),
        ),
        voters: option.votes.map((vote) => ({ name: vote.user?.displayName ?? vote.guest?.name ?? 'Someone', answer: vote.answer.toLowerCase() })),
      })),
    };
  }

  async set(userId: string, itemId: string, input: SetPollDto) {
    const event = await this.editableEvent(userId, itemId);
    if (event.repeatRule) throw new BadRequestException('A repeating event already has its dates');
    if (input.options.some((option) => dateText(dateValue(option.startsOn)) !== option.startsOn)) throw new BadRequestException('Choose real dates');
    const wanted = input.options.map((option) => optionKey(option.startsOn, option.startTime));
    if (new Set(wanted).size !== wanted.length) throw new BadRequestException('Offer each date once');
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.eventPollOption.findMany({ where: { itemId }, select: { id: true, startsOn: true, startTime: true } });
      const kept = new Map(existing.map((option) => [optionKey(dateText(option.startsOn), option.startTime), option.id]));
      await transaction.eventPollOption.deleteMany({ where: { itemId, id: { notIn: wanted.flatMap((option) => kept.get(option) ?? []) } } });
      await transaction.eventPollOption.createMany({
        data: input.options
          .filter((option) => !kept.has(optionKey(option.startsOn, option.startTime)))
          .map((option) => ({ itemId, startsOn: dateValue(option.startsOn), startTime: option.startTime ?? null })),
      });
    });
    return this.forMember(userId, itemId);
  }

  async close(userId: string, itemId: string) {
    await this.editableEvent(userId, itemId);
    await this.prisma.eventPollOption.deleteMany({ where: { itemId } });
  }

  async voteAsMember(userId: string, itemId: string, votes: Record<string, string>) {
    const found = await this.access.assertItem(userId, itemId, 'read');
    if (found.trashedAt) throw new BadRequestException('Restore this event from the trash before voting');
    await this.vote(itemId, { userId }, votes);
    return this.forMember(userId, itemId);
  }

  async forGuest(code: string) {
    const guest = await this.guest(code);
    return { options: (await this.options(guest.itemId)).map((option) => tally(option, option.votes.find((vote) => vote.guestId === guest.id))) };
  }

  async voteAsGuest(code: string, votes: Record<string, string>) {
    const guest = await this.guest(code);
    await this.vote(guest.itemId, { guestId: guest.id }, votes);
    return this.forGuest(code);
  }

  async pick(userId: string, itemId: string, optionId: string) {
    const event = await this.editableEvent(userId, itemId);
    const option = await this.prisma.eventPollOption.findFirst({ where: { id: optionId, itemId } });
    if (!option) throw new NotFoundException('That date is not part of this poll');
    const updated = await this.events.update(userId, itemId, this.pickedDetails(event, option));
    await this.prisma.eventPollOption.deleteMany({ where: { itemId } });
    return updated;
  }

  private pickedDetails(
    event: { startsOn: Date; startTime: string | null; endsOn: Date; endTime: string | null },
    option: { startsOn: Date; startTime: string | null },
  ) {
    const startsOn = dateText(option.startsOn);
    const length = event.endsOn.getTime() - event.startsOn.getTime();
    if (!option.startTime) return { startsOn, startTime: null, endsOn: dateText(new Date(option.startsOn.getTime() + length)), endTime: null };
    if (!event.startTime || !event.endTime) return { startsOn, startTime: option.startTime, endsOn: startsOn, endTime: null };
    const end = new Date(option.startsOn.getTime() + length + (minutes(option.startTime) + minutes(event.endTime) - minutes(event.startTime)) * 60_000);
    return { startsOn, startTime: option.startTime, endsOn: dateText(end), endTime: end.toISOString().slice(11, 16) };
  }

  private options(itemId: string) {
    return this.prisma.eventPollOption.findMany({ where: { itemId }, orderBy: [{ startsOn: 'asc' }, { startTime: 'asc' }, { id: 'asc' }], select: optionFields });
  }

  private async vote(itemId: string, voter: Voter, votes: Record<string, string>) {
    const ids = new Set((await this.prisma.eventPollOption.findMany({ where: { itemId }, select: { id: true } })).map((option) => option.id));
    const entries = Object.entries(votes);
    if (entries.length === 0 || entries.some(([optionId, answer]) => !ids.has(optionId) || !Object.hasOwn(answers, answer))) {
      throw new BadRequestException('Answer yes, maybe or no for the dates in this poll');
    }
    await this.prisma.$transaction(
      entries.map(([optionId, answer]) => {
        const chosen = answers[answer as keyof typeof answers];
        return 'userId' in voter
          ? this.prisma.eventPollVote.upsert({
              where: { optionId_userId: { optionId, userId: voter.userId } },
              create: { optionId, userId: voter.userId, answer: chosen },
              update: { answer: chosen },
            })
          : this.prisma.eventPollVote.upsert({
              where: { optionId_guestId: { optionId, guestId: voter.guestId } },
              create: { optionId, guestId: voter.guestId, answer: chosen },
              update: { answer: chosen },
            });
      }),
    );
  }

  private async guest(code: string) {
    const guest = await this.prisma.eventGuest.findUnique({
      where: { tokenHash: linkTokenHash(code) },
      select: { id: true, itemId: true, item: { select: { trashedAt: true } } },
    });
    if (!guest || guest.item.trashedAt) throw new NotFoundException('This invitation is no longer open');
    return guest;
  }

  private async editableEvent(userId: string, itemId: string) {
    const found = await this.access.assertItem(userId, itemId, 'edit');
    if (found.trashedAt) throw new BadRequestException('Restore this event from the trash before changing it');
    const event = await this.prisma.event.findUnique({ where: { itemId } });
    if (!event) throw new NotFoundException('That item is not an event');
    return event;
  }
}
