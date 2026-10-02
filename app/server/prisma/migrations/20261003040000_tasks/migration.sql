ALTER TYPE "ItemKind" ADD VALUE 'list';

CREATE TABLE "tasks" (
    "item_id" UUID NOT NULL,
    "list_id" UUID,
    "parent_id" UUID,
    "due_date" DATE,
    "due_time" TEXT,
    "time_zone" TEXT NOT NULL,
    "repeat_rule" TEXT,
    "reminder_minutes" INTEGER,
    "assignee_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("item_id")
);

CREATE INDEX "tasks_list_id_idx" ON "tasks"("list_id");

CREATE INDEX "tasks_parent_id_idx" ON "tasks"("parent_id");

CREATE INDEX "tasks_assignee_id_idx" ON "tasks"("assignee_id");

CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
