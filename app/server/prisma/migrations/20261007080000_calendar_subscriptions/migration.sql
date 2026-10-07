CREATE TABLE "calendar_subscriptions" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url_sealed" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "last_fetched_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "calendar_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscribed_events" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "start_time" TEXT,
    "ends_on" DATE NOT NULL,
    "end_time" TEXT,
    "time_zone" TEXT NOT NULL,
    "repeat_rule" TEXT,
    "location" TEXT,
    CONSTRAINT "subscribed_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendar_subscriptions_space_id_idx" ON "calendar_subscriptions"("space_id");

CREATE INDEX "calendar_subscriptions_last_fetched_at_idx" ON "calendar_subscriptions"("last_fetched_at");

CREATE INDEX "subscribed_events_subscription_id_starts_on_idx" ON "subscribed_events"("subscription_id", "starts_on");

ALTER TABLE "calendar_subscriptions" ADD CONSTRAINT "calendar_subscriptions_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_subscriptions" ADD CONSTRAINT "calendar_subscriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subscribed_events" ADD CONSTRAINT "subscribed_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "calendar_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
