CREATE TABLE "search_documents" (
    "item_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body_text" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "search_documents_pkey" PRIMARY KEY ("item_id")
);

CREATE INDEX "search_documents_space_id_idx" ON "search_documents"("space_id");

CREATE INDEX "search_documents_text_idx" ON "search_documents" USING GIN (to_tsvector('english', "title" || ' ' || "body_text"));

ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "sync_search_document"() RETURNS trigger AS $$
BEGIN
    INSERT INTO "search_documents" ("item_id", "space_id", "title", "updated_at")
    VALUES (NEW."id", NEW."space_id", NEW."title", CURRENT_TIMESTAMP)
    ON CONFLICT ("item_id") DO UPDATE
        SET "space_id" = EXCLUDED."space_id", "title" = EXCLUDED."title", "updated_at" = EXCLUDED."updated_at";
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "items_sync_search_document"
    AFTER INSERT OR UPDATE OF "title", "space_id" ON "items"
    FOR EACH ROW EXECUTE FUNCTION "sync_search_document"();

INSERT INTO "search_documents" ("item_id", "space_id", "title")
SELECT "id", "space_id", "title" FROM "items";
