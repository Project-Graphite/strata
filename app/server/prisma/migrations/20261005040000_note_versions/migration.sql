CREATE TABLE "note_versions" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "state" BYTEA NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "note_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "note_versions_item_id_created_at_idx" ON "note_versions"("item_id", "created_at");

ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
