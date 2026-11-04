-- Public folder in the file library

ALTER TABLE "files" ADD COLUMN "public" BOOLEAN NOT NULL DEFAULT false;
