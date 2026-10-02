CREATE TABLE "activity_events" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "actor_id" UUID,
    "item_id" UUID,
    "verb" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inbox_notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inbox_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scheduled_jobs" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "claimed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "done_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_events_space_id_created_at_idx" ON "activity_events"("space_id", "created_at");

CREATE INDEX "activity_events_item_id_idx" ON "activity_events"("item_id");

CREATE INDEX "audit_events_user_id_created_at_idx" ON "audit_events"("user_id", "created_at");

CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

CREATE INDEX "inbox_notifications_user_id_created_at_idx" ON "inbox_notifications"("user_id", "created_at");

CREATE INDEX "scheduled_jobs_run_at_idx" ON "scheduled_jobs"("run_at");

ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inbox_notifications" ADD CONSTRAINT "inbox_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
