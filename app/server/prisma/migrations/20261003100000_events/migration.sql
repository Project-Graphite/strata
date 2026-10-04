CREATE TYPE "GuestResponse" AS ENUM ('pending', 'yes', 'no', 'maybe');

CREATE TABLE "events" (
    "item_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "start_time" TEXT,
    "ends_on" DATE NOT NULL,
    "end_time" TEXT,
    "time_zone" TEXT NOT NULL,
    "repeat_rule" TEXT,
    "location" TEXT,
    "meeting_url" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "reminder_minutes" INTEGER,
    CONSTRAINT "events_pkey" PRIMARY KEY ("item_id")
);

CREATE TABLE "event_guests" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "token_hash" TEXT NOT NULL,
    "response" "GuestResponse" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    CONSTRAINT "event_guests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "events_starts_on_idx" ON "events"("starts_on");

CREATE UNIQUE INDEX "event_guests_token_hash_key" ON "event_guests"("token_hash");

CREATE INDEX "event_guests_item_id_idx" ON "event_guests"("item_id");

ALTER TABLE "events" ADD CONSTRAINT "events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_guests" ADD CONSTRAINT "event_guests_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
