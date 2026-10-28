import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

const slowQueryMs = 300;
const logger = new Logger('Prisma');

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'warn' | 'error'>
  implements OnModuleInit, OnApplicationShutdown
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }
    super({
      adapter: new PrismaPg(connectionString),
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
    this.$on('query', (event) => {
      if (event.duration > slowQueryMs) logger.warn({ slowQueryMs: event.duration, query: event.query });
    });
    this.$on('warn', (event) => logger.warn(event.message));
    this.$on('error', (event) => logger.error(event.message));
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
