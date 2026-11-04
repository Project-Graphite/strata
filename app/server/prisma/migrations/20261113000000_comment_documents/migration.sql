-- Rich text task comments

ALTER TABLE "note_comments" ADD COLUMN "document" JSONB;
