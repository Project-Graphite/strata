-- Task types and relations

ALTER TABLE "tasks" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'task';
CREATE INDEX "tasks_type_idx" ON "tasks"("type");

ALTER TYPE "LinkKind" ADD VALUE 'relates';
ALTER TYPE "LinkKind" ADD VALUE 'blocks';
ALTER TYPE "LinkKind" ADD VALUE 'duplicates';
