CREATE TABLE "note_comments" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "parent_id" UUID,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" UUID,
    "edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "note_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "note_comments_item_id_created_at_idx" ON "note_comments"("item_id", "created_at");

CREATE INDEX "note_comments_parent_id_idx" ON "note_comments"("parent_id");

ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "note_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
