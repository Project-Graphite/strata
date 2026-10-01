import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private connection?: Promise<RedisClientType | undefined>;

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

  async onModuleDestroy() {
    const client = await this.connection;
    if (client?.isOpen) {
      await client.close();
    }
  }

  private async connect() {
    try {
      const client = createClient({
        url: this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
        socket: { reconnectStrategy: false },
      });
      client.on('error', () => undefined);
      await client.connect();
      return client as RedisClientType;
    } catch {
      return undefined;
    }
  }
}
