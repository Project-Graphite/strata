ALTER TABLE "subscribed_events"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "meeting_url" TEXT,
  ADD COLUMN "organizer" TEXT;
