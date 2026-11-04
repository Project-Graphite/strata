-- Folders in the file library, and sharing by link instead of a public folder

ALTER TYPE "ItemKind" ADD VALUE 'folder';

ALTER TABLE "items" ADD COLUMN "folder_id" UUID;
CREATE INDEX "items_folder_id_idx" ON "items"("folder_id");
ALTER TABLE "items" ADD CONSTRAINT "items_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "files" DROP COLUMN "public";