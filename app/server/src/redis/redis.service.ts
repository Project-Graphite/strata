import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

type RedisState = 'connected' | 'ready' | 'reconnecting' | 'error';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private state?: RedisState;
  private connection?: Promise<RedisClientType | undefined>;
  private readonly subscribers: RedisClientType[] = [];

  constructor(private readonly config: ConfigService) {}

  async run<T>(operation: (client: RedisClientType) => Promise<T>) {
    this.connection ??= this.connect();
    const client = await this.connection;
    if (!client) {
      this.connection = undefined;
      return undefined;
    }
    try {
      return await operation(client);
    } catch {
      this.connection = undefined;
      if (client.isOpen) client.destroy();
      return undefined;
    }
  }

  async subscribe(channel: string, listener: (message: string) => void) {
    const client = this.client((retries) => Math.min(2 ** retries * 100, 10_000));
    this.subscribers.push(client);
    try {
      await client.connect();
      await client.subscribe(channel, listener);
      return client;
    } catch {
      return undefined;
    }
  }

  async onModuleDestroy() {
    for (const subscriber of this.subscribers) {
      if (subscriber.isOpen) subscriber.destroy();
    }
    const client = await this.connection;
    if (client?.isOpen) {
      await client.close();
    }
  }

  private async connect() {
    try {
      const client = this.client(false);
      await client.connect();
      return client;
    } catch {
      return undefined;
    }
  }

  private client(reconnectStrategy: false | ((retries: number) => number)) {
    const client = createClient({
      url: this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
      socket: { reconnectStrategy },
    });
    client.on('connect', () => this.transition('connected'));
    client.on('ready', () => this.transition('ready'));
    client.on('reconnecting', () => this.transition('reconnecting'));
    client.on('error', (error: Error) => this.transition('error', error.message));
    return client as RedisClientType;
  }

  private transition(state: RedisState, reason?: string) {
    if (state === this.state || (state === 'error' && this.state === 'reconnecting') || (state === 'connected' && this.state === 'ready')) return;
    this.state = state;
    if (state === 'error') {
      this.logger.warn(`Redis is unavailable (${reason}). Rate limits and sign-in lockouts now count in this process only, and live updates stay on this instance, until Redis is back`);
    } else if (state === 'reconnecting') {
      this.logger.warn('Redis is reconnecting');
    } else {
      this.logger.log(state === 'ready' ? 'Redis is ready; rate limits and sign-in lockouts are shared across instances' : 'Redis connected');
    }
  }
}
