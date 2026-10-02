import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const pollIntervalMs = 30_000;
const claimTimeoutMinutes = 5;
const maxAttempts = 5;
const batchSize = 20;

export type JobHandler = (payload: Prisma.JsonValue) => Promise<void>;

interface ClaimedJob {
  id: string;
  kind: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runDue(), pollIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  handle(kind: string, handler: JobHandler) {
    this.handlers.set(kind, handler);
  }

  schedule(
    kind: string,
    runAt: Date,
    payload: Prisma.InputJsonObject = {},
    client: Prisma.TransactionClient = this.prisma,
  ) {
    return client.scheduledJob.create({ data: { kind, runAt, payload } });
  }

  async runDue(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      for (const job of await this.claim(now)) {
        await this.run(job);
      }
    } catch (error) {
      this.logger.error('Claiming due jobs failed; retrying on the next poll', error);
    } finally {
      this.running = false;
    }
  }

  private claim(now: Date) {
    const at = now.toISOString();
    return this.prisma.$queryRaw<ClaimedJob[]>`
      UPDATE "scheduled_jobs"
      SET "claimed_at" = ${at}::timestamptz AT TIME ZONE 'UTC', "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "scheduled_jobs"
        WHERE "done_at" IS NULL
          AND "failed_at" IS NULL
          AND "run_at" <= ${at}::timestamptz AT TIME ZONE 'UTC'
          AND ("claimed_at" IS NULL
            OR "claimed_at" < (${at}::timestamptz AT TIME ZONE 'UTC') - make_interval(mins => ${claimTimeoutMinutes}))
        ORDER BY "run_at"
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "kind", "payload", "attempts"`;
  }

  private async run(job: ClaimedJob) {
    try {
      const handler = this.handlers.get(job.kind);
      if (!handler) {
        throw new Error(`No handler is registered for ${job.kind} jobs`);
      }
      await handler(job.payload);
      await this.prisma.scheduledJob.update({ where: { id: job.id }, data: { doneAt: new Date(), lastError: null } });
    } catch (error) {
      const lastError = error instanceof Error ? error.message : 'Unknown error';
      const failed = job.attempts >= maxAttempts;
      await this.prisma.scheduledJob.update({
        where: { id: job.id },
        data: failed
          ? { failedAt: new Date(), lastError }
          : { claimedAt: null, lastError, runAt: new Date(Date.now() + 2 ** job.attempts * 60_000) },
      });
      this.logger.warn(`${job.kind} job ${job.id} failed (attempt ${job.attempts}${failed ? ', giving up' : ''}): ${lastError}`);
    }
  }
}
