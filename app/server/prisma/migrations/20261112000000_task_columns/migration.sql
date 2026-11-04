-- Custom task board columns

CREATE TABLE "task_columns" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_columns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_columns_space_id_name_key" ON "task_columns"("space_id", "name");
ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD COLUMN "column_id" UUID;
CREATE INDEX "tasks_column_id_idx" ON "tasks"("column_id");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "task_columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;