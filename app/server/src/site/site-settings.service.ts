import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const cacheMs = 30_000;

export interface SiteSettings {
  inviteOnly: boolean;
}

@Injectable()
export class SiteSettingsService {
  private cached?: { settings: SiteSettings; expiresAt: number };

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SiteSettings> {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.settings;
    }
    const stored = await this.prisma.siteSettings.findUnique({ where: { id: 1 }, select: { inviteOnly: true } });
    return this.remember(stored ?? { inviteOnly: false });
  }

  async update(settings: SiteSettings) {
    return this.remember(
      await this.prisma.siteSettings.upsert({
        where: { id: 1 },
        update: settings,
        create: settings,
        select: { inviteOnly: true },
      }),
    );
  }

  private remember(settings: SiteSettings) {
    this.cached = { settings, expiresAt: Date.now() + cacheMs };
    return settings;
  }
}
