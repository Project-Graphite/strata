import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccessModule } from './access/access.module';
import { AccessTokensModule } from './access-tokens/access-tokens.module';
import { TokenAuthModule } from './access-tokens/token-auth.module';
import { ActivityModule } from './activity/activity.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BookmarksModule } from './bookmarks/bookmarks.module';
import { validateEnvironment } from './config/environment';
import { CryptoModule } from './crypto/crypto.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { EventsModule } from './events/events.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { FilesModule } from './files/files.module';
import { CalendarModule } from './calendar/calendar.module';
import { HabitsModule } from './habits/habits.module';
import { JournalModule } from './journal/journal.module';
import { HealthModule } from './health/health.module';
import { InboxModule } from './inbox/inbox.module';
import { ItemsModule } from './items/items.module';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mail.module';
import { NotesModule } from './notes/notes.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReviewModule } from './review/review.module';
import { RedisModule } from './redis/redis.module';
import { SearchModule } from './search/search.module';
import { ShareLinksModule } from './share-links/share-links.module';
import { SiteModule } from './site/site.module';
import { SpacesModule } from './spaces/spaces.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TagsModule } from './tags/tags.module';
import { TasksModule } from './tasks/tasks.module';
import { TidyModule } from './tidy/tidy.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WidgetsModule } from './widgets/widgets.module';

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
    TasksModule,
    SubscriptionsModule,
    BookmarksModule,
    DashboardsModule,
    EventsModule,
    ExchangeRatesModule,
    TidyModule,
    CalendarModule,
    HabitsModule,
    JournalModule,
    NotesModule,
    RealtimeModule,
    ReviewModule,
    WebhooksModule,
    WidgetsModule,
    HealthModule,
  ],
})
export class AppModule {}
