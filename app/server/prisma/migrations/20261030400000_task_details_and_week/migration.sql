CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'done');

ALTER TABLE "users" ADD COLUMN     "week_start" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weekend_days" INTEGER[] DEFAULT ARRAY[5, 6]::INTEGER[];

ALTER TABLE "tasks" ADD COLUMN     "description" JSONB,
ADD COLUMN     "status" "TaskStatus" NOT NULL DEFAULT 'open';

UPDATE "tasks" SET "status" = 'done' WHERE "completed_at" IS NOT NULL;
