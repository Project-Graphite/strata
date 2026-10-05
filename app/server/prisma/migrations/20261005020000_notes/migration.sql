CREATE TABLE "notes" (
    "item_id" UUID NOT NULL,
    "parent_id" UUID,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "icon" TEXT,
    "pinned_at" TIMESTAMP(3),
    CONSTRAINT "notes_pkey" PRIMARY KEY ("item_id")
);

CREATE TABLE "note_documents" (
    "item_id" UUID NOT NULL,
    "state" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "note_documents_pkey" PRIMARY KEY ("item_id")
);

CREATE INDEX "notes_parent_id_idx" ON "notes"("parent_id");

ALTER TABLE "notes" ADD CONSTRAINT "notes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notes" ADD CONSTRAINT "notes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "note_documents" ADD CONSTRAINT "note_documents_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "notes" ("item_id") SELECT "id" FROM "items" WHERE "kind" = 'note';
