-- Where a finished task was before it was done, so reopening puts it back there
ALTER TABLE "tasks" ADD COLUMN "done_from_status" "TaskStatus",
ADD COLUMN "done_from_column_id" UUID;
