ALTER TABLE "tidy_rules" ADD COLUMN "file_type" TEXT;

ALTER TABLE "tidy_rules" ALTER COLUMN "title_contains" SET DEFAULT '';
