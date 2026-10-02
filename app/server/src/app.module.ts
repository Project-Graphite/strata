import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccessModule } from './access/access.module';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/environment';
import { CryptoModule } from './crypto/crypto.module';
import { HealthModule } from './health/health.module';
import { ItemsModule } from './items/items.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { ShareLinksModule } from './share-links/share-links.module';
import { SiteModule } from './site/site.module';
import { SpacesModule } from './spaces/spaces.module';
import { TagsModule } from './tags/tags.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    CryptoModule,
    AccessModule,
    SiteModule,
    RedisModule,
    MailModule,
    AuthModule,
    UsersModule,
    SpacesModule,
    TagsModule,
    ItemsModule,
    ShareLinksModule,
    HealthModule,
  ],
})
export class AppModule {}
