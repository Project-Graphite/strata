import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccessModule } from './access/access.module';
import { AccessTokensModule } from './access-tokens/access-tokens.module';
import { TokenAuthModule } from './access-tokens/token-auth.module';
import { ActivityModule } from './activity/activity.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/environment';
import { CryptoModule } from './crypto/crypto.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { InboxModule } from './inbox/inbox.module';
import { ItemsModule } from './items/items.module';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SearchModule } from './search/search.module';
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
    TokenAuthModule,
    ActivityModule,
    AuditModule,
    InboxModule,
    JobsModule,
    SiteModule,
    RedisModule,
    MailModule,
    AuthModule,
    UsersModule,
    SpacesModule,
    TagsModule,
    ItemsModule,
    ShareLinksModule,
    FilesModule,
    AccessTokensModule,
    SearchModule,
    HealthModule,
  ],
})
export class AppModule {}
