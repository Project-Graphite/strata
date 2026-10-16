import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
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
    client.on('error', () => undefined);
    return client as RedisClientType;
  }
}
