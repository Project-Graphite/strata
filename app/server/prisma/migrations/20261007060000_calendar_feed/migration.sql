ALTER TABLE "users" ADD COLUMN "calendar_feed_hash" TEXT;

CREATE UNIQUE INDEX "users_calendar_feed_hash_key" ON "users"("calendar_feed_hash");
