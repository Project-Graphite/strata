-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "excluded_dates" DATE[] DEFAULT ARRAY[]::DATE[];

-- CreateTable
CREATE TABLE "google_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refresh_token_sealed" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "calendar_synced_at" TIMESTAMP(3),
    "calendar_syncing_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendars" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "calendar_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "writable" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sync_token" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_events" (
    "id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "item_id" UUID,
    "event_id" TEXT NOT NULL,
    "recurring_event_id" TEXT,
    "original_starts_on" DATE,
    "etag" TEXT NOT NULL,
    "strata_hash" TEXT NOT NULL,
    "from_google" BOOLEAN NOT NULL,
    "unreadable_rule" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "google_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_accounts_user_id_key" ON "google_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_accounts_subject_key" ON "google_accounts"("subject");

-- CreateIndex
CREATE INDEX "google_accounts_calendar_synced_at_idx" ON "google_accounts"("calendar_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendars_user_id_calendar_id_key" ON "google_calendars"("user_id", "calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_events_item_id_key" ON "google_events"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_events_calendar_id_event_id_key" ON "google_events"("calendar_id", "event_id");

-- AddForeignKey
ALTER TABLE "google_accounts" ADD CONSTRAINT "google_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendars" ADD CONSTRAINT "google_calendars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_events" ADD CONSTRAINT "google_events_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "google_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_events" ADD CONSTRAINT "google_events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
