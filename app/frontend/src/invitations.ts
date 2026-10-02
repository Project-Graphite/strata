import type { TagColor } from '@project-graphite/ui';
import type { SpaceRole } from './spaces';
import { atMost, type Check } from './validation';

export interface InviteDetails {
  kind: 'app' | 'space';
  email: string | null;
  space: string | null;
  inviter: string | null;
}

export interface ReceivedInvitation {
  id: string;
  space: { id: string; name: string; color: TagColor };
  role: SpaceRole;
  inviter: { handle: string; displayName: string } | null;
  note: string | null;
  expiresAt: string;
}

export interface SentInvitation {
  id: string;
  kind: 'app' | 'space';
  email: string | null;
  invitee: { handle: string; displayName: string } | null;
  role: SpaceRole | null;
  note: string | null;
  status: 'pending' | 'used' | 'expired' | 'withdrawn';
  joined: { handle: string; displayName: string; redeemedAt: string }[];
  createdAt: string;
  expiresAt: string;
}

export function invitedLine(invite: InviteDetails) {
  return `${invite.inviter ?? 'Someone'} invited you to ${invite.space ?? 'Strata'}.`;
}

export const noteChecks: Check[] = [
  atMost(280, 'Use at most 280 characters.'),
  (value) => (/\/\/|www\./.test(value) ? 'Notes cannot contain links.' : undefined),
];
