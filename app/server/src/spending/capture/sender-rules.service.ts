import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../../access/access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { cardKindOf } from '../accounts.service';
import { UpdateSenderRuleDto } from '../dto/capture.dto';
import { senderKey } from './matching';

export const senderRuleFields = {
  id: true,
  spaceId: true,
  pattern: true,
  accountId: true,
  cardId: true,
  toAccountId: true,
  ignore: true,
  card: { select: { last4: true, accountId: true } },
} satisfies Prisma.SenderRuleSelect;

type SenderRuleRow = Prisma.SenderRuleGetPayload<{ select: typeof senderRuleFields }>;

const present = (rule: SenderRuleRow) => ({ id: rule.id, sender: rule.pattern, accountId: rule.accountId, cardDigits: rule.card?.last4 ?? null, toAccountId: rule.toAccountId, ignore: rule.ignore });

@Injectable()
export class SenderRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  rulesOf(spaceId: string) {
    return this.prisma.senderRule.findMany({ where: { spaceId }, select: senderRuleFields });
  }

  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const rules = await this.prisma.senderRule.findMany({ where: { spaceId }, select: senderRuleFields, orderBy: [{ pattern: 'asc' }, { createdAt: 'asc' }] });
    return rules.map(present);
  }

  async update(userId: string, id: string, input: UpdateSenderRuleDto) {
    const rule = await this.own(userId, id);
    if (rule.ignore) throw new BadRequestException('Delete this rule to stop ignoring the sender');
    if (input.toAccountId && !rule.toAccountId) throw new BadRequestException('Only transfer rules have a second account');
    const accountId = input.accountId ?? rule.accountId!;
    const toAccountId = rule.toAccountId && (input.toAccountId ?? rule.toAccountId);
    if (toAccountId === accountId) throw new BadRequestException('A transfer moves money between two different accounts');
    const ids = [accountId, ...(toAccountId ? [toAccountId] : [])];
    if ((await this.prisma.moneyAccount.count({ where: { spaceId: rule.spaceId, id: { in: ids } } })) !== ids.length) throw new BadRequestException('Choose an account from this space');
    return present(
      await this.prisma.senderRule.update({
        where: { id },
        data: { accountId, toAccountId, cardId: rule.card?.accountId === accountId ? rule.cardId : null },
        select: senderRuleFields,
      }),
    );
  }

  async remove(userId: string, id: string) {
    await this.own(userId, id);
    await this.prisma.senderRule.delete({ where: { id } });
  }

  async ignore(spaceId: string, sender: string) {
    const pattern = senderKey(sender);
    if (!(await this.prisma.senderRule.findFirst({ where: { spaceId, pattern, ignore: true }, select: { id: true } }))) {
      await this.prisma.senderRule.create({ data: { spaceId, pattern, ignore: true } });
    }
  }

  async learnAccount(spaceId: string, sender: string, accountId: string, cardDigits: string | null | undefined) {
    const account = await this.prisma.moneyAccount.findFirstOrThrow({ where: { id: accountId, spaceId }, select: { kind: true } });
    const card = cardDigits
      ? await this.prisma.card.upsert({ where: { accountId_last4: { accountId, last4: cardDigits } }, create: { accountId, last4: cardDigits, kind: cardKindOf(account.kind) }, update: {}, select: { id: true } })
      : null;
    const rule = { spaceId, pattern: senderKey(sender), cardId: card?.id ?? null };
    const existing = await this.prisma.senderRule.findFirst({ where: { ...rule, toAccountId: null, ignore: false }, select: { id: true } });
    if (existing) await this.prisma.senderRule.update({ where: { id: existing.id }, data: { accountId } });
    else await this.prisma.senderRule.create({ data: { ...rule, accountId } });
  }

  async learnTransfer(spaceId: string, sender: string, accountId: string, toAccountId: string) {
    if (!(await this.prisma.senderRule.findFirst({ where: { spaceId, accountId, toAccountId }, select: { id: true } }))) {
      await this.prisma.senderRule.create({ data: { spaceId, pattern: senderKey(sender), accountId, toAccountId } });
    }
  }

  private async own(userId: string, id: string) {
    const rule = await this.prisma.senderRule.findUnique({ where: { id }, select: senderRuleFields });
    if (!rule) throw new NotFoundException('Rule not found');
    await this.access.assertPersonalSpace(userId, rule.spaceId);
    return rule;
  }
}
