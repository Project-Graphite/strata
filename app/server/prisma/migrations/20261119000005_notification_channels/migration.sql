-- Kinds each person keeps out of the bell, and an opt-in daily journal reminder
ALTER TABLE "users" ADD COLUMN     "inbox_muted" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "journal_reminder" BOOLEAN NOT NULL DEFAULT false;

-- Notifications kept out of the bell still reach email and devices
ALTER TABLE "inbox_notifications" ADD COLUMN     "shown" BOOLEAN NOT NULL DEFAULT true;