import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const cacheMs = 30_000;

export interface SiteSettings {
  inviteOnly: boolean;
  fileQuotaMb: number;
}

const settingsFields = { inviteOnly: true, fileQuotaMb: true } as const;

@Injectable()
export class SiteSettingsService {
  private cached?: { settings: SiteSettings; expiresAt: number };

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SiteSettings> {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.settings;
    }
    const stored = await this.prisma.siteSettings.findUnique({ where: { id: 1 }, select: settingsFields });
    return this.remember(stored ?? { inviteOnly: false, fileQuotaMb: 100 });
  }

  async update(settings: Partial<SiteSettings>) {
    return this.remember(
      await this.prisma.siteSettings.upsert({
        where: { id: 1 },
        update: settings,
        create: settings,
        select: settingsFields,
      }),
    );
  }

  private remember(settings: SiteSettings) {
    this.cached = { settings, expiresAt: Date.now() + cacheMs };
    return settings;
  }
}
