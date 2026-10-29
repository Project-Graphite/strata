-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "cover_alt" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cover_id" UUID,
ADD COLUMN     "narrow" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "notes_cover_id_idx" ON "notes"("cover_id");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_cover_id_fkey" FOREIGN KEY ("cover_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
