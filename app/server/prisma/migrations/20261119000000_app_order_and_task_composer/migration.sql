-- Apps in the order each person arranged them, seeded from the order they turned them on
ALTER TABLE "users" ADD COLUMN     "app_order" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "users" SET "app_order" = "features";

-- How each person last chose to write a new task
ALTER TABLE "users" ADD COLUMN     "task_composer" TEXT NOT NULL DEFAULT 'condensed';
