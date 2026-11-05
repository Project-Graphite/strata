-- Archived spaces drop out of the sidebar until they are brought back
ALTER TABLE "spaces" ADD COLUMN "archived_at" TIMESTAMP(3);
