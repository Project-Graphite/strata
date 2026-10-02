import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';

const runIntervalMs = 5 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

@Injectable()
export class MaintenanceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.run(), runIntervalMs);
    this.timer.unref();
    void this.run();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      await this.prune(now);
    } catch (error) {
      this.logger.error('Maintenance run failed; retrying on the next run', error);
    } finally {
      this.running = false;
    }
  }

  private async prune(now: Date) {
    const ago = (days: number) => new Date(now.getTime() - days * dayMs);
    await this.prisma.item.deleteMany({ where: { trashedAt: { lt: ago(30) } } });
    await this.prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.prisma.signInChallenge.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.prisma.refreshSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: ago(1) } }] },
    });
    await this.prisma.invitation.deleteMany({
      where: { OR: [{ expiresAt: { lt: ago(30) } }, { revokedAt: { lt: ago(30) } }] },
    });
    await this.prisma.shareLink.deleteMany({
      where: { OR: [{ expiresAt: { lt: ago(30) } }, { revokedAt: { lt: ago(30) } }] },
    });
    await this.prisma.auditEvent.deleteMany({ where: { createdAt: { lt: ago(90) } } });
    await this.prisma.inboxNotification.deleteMany({
      where: { OR: [{ readAt: { lt: ago(90) } }, { createdAt: { lt: ago(180) } }] },
    });
    await this.prisma.scheduledJob.deleteMany({
      where: { OR: [{ doneAt: { lt: ago(30) } }, { failedAt: { lt: ago(30) } }] },
    });
    await this.prisma.accessToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: ago(30) } }, { revokedAt: { lt: ago(30) } }] },
    });
    await this.files.removeOrphans(now);
  }
}
