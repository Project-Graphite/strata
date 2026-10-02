import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvitationKind, Prisma, SpaceRole } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { linkTokenHash, newLinkToken } from '../crypto/link-token';
import { InboxService } from '../inbox/inbox.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { InviteToSpaceDto, InviteToStrataDto } from './dto/invitations.dto';

const lifetimeMs = 14 * 24 * 60 * 60 * 1000;

const sentFields = {
  id: true,
  kind: true,
  email: true,
  role: true,
  note: true,
  useCount: true,
  maxUses: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  invitee: { select: { handle: true, displayName: true } },
  redemptions: {
    orderBy: { redeemedAt: 'asc' },
    select: { redeemedAt: true, user: { select: { handle: true, displayName: true } } },
  },
} satisfies Prisma.InvitationSelect;

const receivedFields = {
  id: true,
  role: true,
  note: true,
  expiresAt: true,
  space: { select: { id: true, name: true, color: true } },
  inviter: { select: { handle: true, displayName: true } },
} satisfies Prisma.InvitationSelect;

interface Invitee {
  id: string;
  email: string;
}

function presentSent(invitation: Prisma.InvitationGetPayload<{ select: typeof sentFields }>) {
  return {
    id: invitation.id,
    kind: invitation.kind.toLowerCase(),
    email: invitation.email,
    invitee: invitation.invitee,
    role: invitation.role?.toLowerCase() ?? null,
    note: invitation.note,
    status: invitation.revokedAt
      ? 'withdrawn'
      : invitation.useCount >= invitation.maxUses
        ? 'used'
        : invitation.expiresAt <= new Date()
          ? 'expired'
          : 'pending',
    joined: invitation.redemptions.map((redemption) => ({ ...redemption.user, redeemedAt: redemption.redeemedAt })),
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
  };
}

function presentReceived(invitation: Prisma.InvitationGetPayload<{ select: typeof receivedFields }>) {
  return {
    id: invitation.id,
    space: invitation.space,
    role: invitation.role?.toLowerCase() ?? null,
    inviter: invitation.inviter,
    note: invitation.note,
    expiresAt: invitation.expiresAt,
  };
}

function gone() {
  return new NotFoundException('This invite has expired or was withdrawn');
}

function addressedTo(invitation: { inviteeId: string | null; email: string | null }, user: Invitee) {
  return invitation.inviteeId ? invitation.inviteeId === user.id : !invitation.email || invitation.email === user.email;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
    private readonly inbox: InboxService,
  ) {}

  async inviteToStrata(userId: string, input: InviteToStrataDto) {
    const inviter = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });
    const { token, tokenHash } = newLinkToken();
    const invitation = await this.prisma.invitation.create({
      data: {
        kind: InvitationKind.APP,
        email: input.email,
        note: input.note || null,
        tokenHash,
        inviterId: userId,
        expiresAt: new Date(Date.now() + lifetimeMs),
      },
      select: sentFields,
    });
    const link = this.mail.link(`/invite/${token}`);
    const emailed =
      input.email !== undefined &&
      (await this.mail.trySend({
        to: input.email,
        subject: `${inviter.displayName} invited you to Strata`,
        text: [
          'Hi,',
          '',
          `${inviter.displayName} invited you to Strata, a private workspace for your notes, agenda, subscriptions and files.`,
          ...this.noteLines(input.note),
          '',
          'Create your account with this link within 14 days:',
          '',
          link,
          '',
          'If you already have a Strata account, sign in instead. If you did not expect this, ignore this email.',
        ].join('\n'),
      }));
    return { invitation: presentSent(invitation), link, emailed };
  }

  async sent(userId: string) {
    const invitations = await this.prisma.invitation.findMany({
      where: { inviterId: userId, kind: InvitationKind.APP },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
      select: sentFields,
    });
    return invitations.map(presentSent);
  }

  async inviteToSpace(userId: string, spaceId: string, input: InviteToSpaceDto) {
    if (input.email !== undefined && input.handle !== undefined) {
      throw new BadRequestException('Invite by email or by handle, not both');
    }
    await this.access.assertSpace(userId, spaceId, 'manage');
    const [space, inviter] = await Promise.all([
      this.prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { name: true, personalOwnerId: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } }),
    ]);
    if (space.personalOwnerId) {
      throw new BadRequestException('Personal spaces cannot be shared. Create a shared space instead.');
    }
    const invitee = input.handle
      ? await this.prisma.user.findUnique({
          where: { handle: input.handle },
          select: { id: true, email: true, displayName: true, memberships: { where: { spaceId }, select: { role: true } } },
        })
      : null;
    if (input.handle && !invitee) {
      throw new NotFoundException('No one uses that handle');
    }
    if (invitee?.memberships.length) {
      throw new ConflictException(`@${input.handle} is already a member of this space`);
    }
    const target = invitee ? { inviteeId: invitee.id } : { email: input.email };
    const { token, tokenHash } = newLinkToken();
    const invitation = await this.prisma.$transaction(async (transaction) => {
      await transaction.invitation.updateMany({
        where: { spaceId, ...target, ...this.pending() },
        data: { revokedAt: new Date() },
      });
      const created = await transaction.invitation.create({
        data: {
          kind: InvitationKind.SPACE,
          spaceId,
          role: input.role.toUpperCase() as SpaceRole,
          ...target,
          note: input.note || null,
          tokenHash,
          inviterId: userId,
          expiresAt: new Date(Date.now() + lifetimeMs),
        },
        select: sentFields,
      });
      const recipient =
        invitee ??
        (await transaction.user.findUnique({ where: { email: input.email }, select: { id: true } }));
      if (recipient) {
        await this.inbox.notify(transaction, [
          {
            userId: recipient.id,
            kind: 'invitation',
            title: `${inviter.displayName} invited you to ${space.name}`,
            body: input.note || undefined,
            link: '/invitations',
          },
        ]);
      }
      return created;
    });
    const link = this.mail.link(invitee ? '/invitations' : `/invite/${token}`);
    const emailed = await this.mail.trySend({
      to: invitee?.email ?? input.email!,
      subject: `${inviter.displayName} invited you to ${space.name} on Strata`,
      text: [
        invitee ? `Hi ${invitee.displayName},` : 'Hi,',
        '',
        `${inviter.displayName} invited you to join the space "${space.name}" on Strata as ${input.role === 'viewer' ? 'a viewer' : `an ${input.role}`}.`,
        ...this.noteLines(input.note),
        '',
        invitee ? 'Accept or decline it from your invitations:' : 'Join within 14 days with this link:',
        '',
        link,
        '',
        'If you did not expect this, ignore this email.',
      ].join('\n'),
    });
    return { invitation: presentSent(invitation), emailed };
  }

  async forSpace(userId: string, spaceId: string) {
    await this.access.assertSpace(userId, spaceId, 'manage');
    const invitations = await this.prisma.invitation.findMany({
      where: { spaceId, ...this.pending() },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: sentFields,
    });
    return invitations.map(presentSent);
  }

  async withdraw(userId: string, invitationId: string) {
    const withdrawn = await this.prisma.invitation.updateMany({
      where: {
        id: invitationId,
        revokedAt: null,
        OR: [{ inviterId: userId }, { space: this.access.spacesOf(userId, 'manage') }],
      },
      data: { revokedAt: new Date() },
    });
    if (withdrawn.count === 0) {
      throw new NotFoundException('That invite is already gone');
    }
  }

  async received(userId: string) {
    const user = await this.invitee(userId);
    const invitations = await this.prisma.invitation.findMany({
      where: { ...this.addressedWhere(user), ...this.pending() },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: receivedFields,
    });
    return invitations.map(presentReceived);
  }

  async accept(userId: string, invitationId: string) {
    const invitation = await this.receivedOne(userId, invitationId);
    await this.prisma.$transaction((transaction) => this.join(transaction, invitation, userId));
    return { spaceId: invitation.spaceId };
  }

  async decline(userId: string, invitationId: string) {
    const invitation = await this.receivedOne(userId, invitationId);
    await this.prisma.invitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
  }

  async lookup(code: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { tokenHash: linkTokenHash(code), ...this.pending() },
      select: {
        kind: true,
        email: true,
        space: { select: { name: true } },
        inviter: { select: { displayName: true } },
      },
    });
    if (!invitation) {
      throw gone();
    }
    return {
      kind: invitation.kind.toLowerCase(),
      email: invitation.email,
      space: invitation.space?.name ?? null,
      inviter: invitation.inviter?.displayName ?? null,
    };
  }

  async redeem(userId: string, code: string) {
    const user = await this.invitee(userId);
    const invitation = await this.byCode(this.prisma, code, user);
    if (invitation.kind === InvitationKind.APP) {
      return { spaceId: null };
    }
    await this.prisma.$transaction((transaction) => this.join(transaction, invitation, userId));
    return { spaceId: invitation.spaceId };
  }

  async redeemOnSignUp(client: Prisma.TransactionClient, code: string, user: Invitee) {
    await this.join(client, await this.byCode(client, code, user), user.id);
  }

  private async byCode(client: Prisma.TransactionClient, code: string, user: Invitee) {
    const invitation = await client.invitation.findFirst({
      where: { tokenHash: linkTokenHash(code), ...this.pending() },
      select: { id: true, kind: true, spaceId: true, role: true, email: true, inviteeId: true },
    });
    if (!invitation) {
      throw gone();
    }
    if (!addressedTo(invitation, user)) {
      throw new ForbiddenException(
        'This invite was sent to someone else. Use the account or email address it was sent to, or ask for a new invite.',
      );
    }
    return invitation;
  }

  private async receivedOne(userId: string, invitationId: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ...this.addressedWhere(await this.invitee(userId)), ...this.pending() },
      select: { id: true, kind: true, spaceId: true, role: true },
    });
    if (!invitation) {
      throw gone();
    }
    return invitation;
  }

  private async join(
    client: Prisma.TransactionClient,
    invitation: { id: string; kind: InvitationKind; spaceId: string | null; role: SpaceRole | null },
    userId: string,
  ) {
    const claimed = await client.invitation.updateMany({
      where: { id: invitation.id, ...this.pending() },
      data: { useCount: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw gone();
    }
    await client.invitationRedemption.createMany({
      data: [{ invitationId: invitation.id, userId }],
      skipDuplicates: true,
    });
    if (invitation.kind !== InvitationKind.SPACE || !invitation.spaceId || !invitation.role) {
      return;
    }
    const spaceId = invitation.spaceId;
    const joined = await client.spaceMember.createMany({
      data: [{ spaceId, userId, role: invitation.role }],
      skipDuplicates: true,
    });
    if (joined.count === 0) {
      return;
    }
    const member = await client.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });
    const owners = await client.spaceMember.findMany({
      where: { spaceId, role: SpaceRole.OWNER, userId: { not: userId } },
      select: { userId: true, space: { select: { name: true } } },
    });
    await this.activity.record(client, {
      spaceId,
      actorId: userId,
      verb: 'member.joined',
      data: { member: member.displayName, role: invitation.role.toLowerCase() },
    });
    await this.inbox.notify(
      client,
      owners.map((owner) => ({
        userId: owner.userId,
        kind: 'member_joined' as const,
        title: `${member.displayName} joined ${owner.space.name}`,
        link: `/spaces/${spaceId}/members`,
      })),
    );
  }

  private pending(): Prisma.InvitationWhereInput {
    return {
      revokedAt: null,
      expiresAt: { gt: new Date() },
      useCount: { lt: this.prisma.invitation.fields.maxUses },
    };
  }

  private addressedWhere(user: Invitee): Prisma.InvitationWhereInput {
    return { kind: InvitationKind.SPACE, OR: [{ inviteeId: user.id }, { inviteeId: null, email: user.email }] };
  }

  private invitee(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true } });
  }

  private noteLines(note?: string) {
    return note ? ['', 'Their note:', '', note] : [];
  }
}
