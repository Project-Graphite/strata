import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { SecretBox } from '../crypto/secret-box.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { matchingStep, newTotpSecret, otpauthUri } from './totp';

const recoveryAlphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const recoveryCodeCount = 10;

function normalizedRecoveryCode(code: string) {
  return code.replace(/[\s-]/g, '').toLowerCase();
}

function digest(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

function newRecoveryCode() {
  const characters = Array.from({ length: 12 }, () => recoveryAlphabet[randomInt(recoveryAlphabet.length)]).join('');
  return characters.match(/.{4}/g)!.join('-');
}

@Injectable()
export class TwoStepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly box: SecretBox,
    private readonly mail: MailService,
  ) {}

  async enabled(userId: string) {
    const credential = await this.prisma.twoStepCredential.findUnique({
      where: { userId },
      select: { confirmedAt: true },
    });
    return Boolean(credential?.confirmedAt);
  }

  async status(userId: string) {
    const [enabled, recoveryCodesLeft] = await Promise.all([
      this.enabled(userId),
      this.prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
    ]);
    return { enabled, recoveryCodesLeft: enabled ? recoveryCodesLeft : 0 };
  }

  async setup(userId: string) {
    if (await this.enabled(userId)) {
      throw new ConflictException('Two-step sign-in is already on');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const secret = newTotpSecret();
    const secretEncrypted = this.box.seal(secret);
    await this.prisma.twoStepCredential.upsert({
      where: { userId },
      create: { userId, secretEncrypted },
      update: { secretEncrypted, confirmedAt: null, lastUsedStep: null },
    });
    return { secret, uri: otpauthUri(secret, user.email) };
  }

  async confirm(userId: string, code: string) {
    const credential = await this.prisma.twoStepCredential.findUnique({ where: { userId } });
    if (!credential || credential.confirmedAt) {
      throw new BadRequestException('Start setting up two-step sign-in first');
    }
    const step = matchingStep(this.box.open(credential.secretEncrypted), code.trim());
    if (step === null) {
      throw new BadRequestException('That code is not right. Check the time on your phone and try again.');
    }
    const codes = Array.from({ length: recoveryCodeCount }, newRecoveryCode);
    const user = await this.prisma.$transaction(async (transaction) => {
      await transaction.twoStepCredential.update({
        where: { userId },
        data: { confirmedAt: new Date(), lastUsedStep: step },
      });
      await transaction.recoveryCode.deleteMany({ where: { userId } });
      await transaction.recoveryCode.createMany({
        data: codes.map((recovery) => ({ userId, codeHash: digest(normalizedRecoveryCode(recovery)) })),
      });
      return transaction.user.findUniqueOrThrow({ where: { id: userId } });
    });
    await this.alert(user, 'Two-step sign-in is on for your Strata account', [
      'Signing in to Strata now also needs a code from your authenticator app or one of your recovery codes.',
    ]);
    return { recoveryCodes: codes };
  }

  async disable(userId: string) {
    const user = await this.prisma.$transaction(async (transaction) => {
      await transaction.twoStepCredential.deleteMany({ where: { userId } });
      await transaction.recoveryCode.deleteMany({ where: { userId } });
      return transaction.user.findUniqueOrThrow({ where: { id: userId } });
    });
    await this.alert(user, 'Two-step sign-in is off for your Strata account', [
      'Signing in to Strata now needs only your password.',
    ]);
  }

  async regenerateRecoveryCodes(userId: string) {
    if (!(await this.enabled(userId))) {
      throw new BadRequestException('Turn on two-step sign-in first');
    }
    const codes = Array.from({ length: recoveryCodeCount }, newRecoveryCode);
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.createMany({
        data: codes.map((recovery) => ({ userId, codeHash: digest(normalizedRecoveryCode(recovery)) })),
      }),
    ]);
    return { recoveryCodes: codes };
  }

  async verify(userId: string, code: string) {
    const credential = await this.prisma.twoStepCredential.findUnique({ where: { userId } });
    if (!credential?.confirmedAt) {
      return false;
    }
    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      const step = matchingStep(this.box.open(credential.secretEncrypted), trimmed);
      if (step === null) return false;
      const claimed = await this.prisma.twoStepCredential.updateMany({
        where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
        data: { lastUsedStep: step },
      });
      return claimed.count === 1;
    }
    const used = await this.prisma.recoveryCode.updateMany({
      where: { userId, codeHash: digest(normalizedRecoveryCode(trimmed)), usedAt: null },
      data: { usedAt: new Date() },
    });
    return used.count === 1;
  }

  private alert(user: { email: string; displayName: string }, subject: string, lines: string[]) {
    return this.mail.trySend({
      to: user.email,
      subject,
      text: [
        `Hi ${user.displayName},`,
        '',
        ...lines,
        '',
        'If this was not you, reset your password now and sign out your other devices:',
        '',
        this.mail.link('/forgot-password'),
      ].join('\n'),
    });
  }
}
