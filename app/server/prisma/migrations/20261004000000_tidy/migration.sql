CREATE TYPE "TidyAction" AS ENUM ('archive', 'trash', 'tag', 'cancel');

CREATE TABLE "tidy_batches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" "TidyAction" NOT NULL,
    "tag_id" UUID,
    "rule_id" UUID,
    "item_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMP(3),
    CONSTRAINT "tidy_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tidy_changes" (
    "batch_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    CONSTRAINT "tidy_changes_pkey" PRIMARY KEY ("batch_id","item_id")
);

CREATE TABLE "tidy_rules" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "title_contains" TEXT NOT NULL,
    "kind" "ItemKind",
    "tag_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "checked_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tidy_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tidy_batches_user_id_created_at_idx" ON "tidy_batches"("user_id", "created_at");

CREATE INDEX "tidy_changes_item_id_idx" ON "tidy_changes"("item_id");

CREATE INDEX "tidy_rules_space_id_idx" ON "tidy_rules"("space_id");

ALTER TABLE "tidy_batches" ADD CONSTRAINT "tidy_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tidy_batches" ADD CONSTRAINT "tidy_batches_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tidy_batches" ADD CONSTRAINT "tidy_batches_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "tidy_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tidy_changes" ADD CONSTRAINT "tidy_changes_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "tidy_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tidy_changes" ADD CONSTRAINT "tidy_changes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tidy_rules" ADD CONSTRAINT "tidy_rules_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tidy_rules" ADD CONSTRAINT "tidy_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tidy_rules" ADD CONSTRAINT "tidy_rules_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
