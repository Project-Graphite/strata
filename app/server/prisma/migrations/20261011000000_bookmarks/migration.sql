ALTER TYPE "ItemKind" ADD VALUE 'bookmark';

CREATE TABLE "bookmarks" (
    "item_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "site_name" TEXT,
    "description" TEXT,
    "read_at" TIMESTAMP(3),
    "article" JSONB,
    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("item_id")
);

ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
