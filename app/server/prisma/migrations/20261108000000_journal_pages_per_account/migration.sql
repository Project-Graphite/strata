-- Journal pages per account

CREATE TABLE "weekly_reviews" (
    "note_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "weekly_reviews_pkey" PRIMARY KEY ("note_id")
);
CREATE INDEX "weekly_reviews_user_id_created_at_idx" ON "weekly_reviews"("user_id", "created_at");
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "weekly_reviews" ("note_id", "user_id", "created_at")
SELECT "i"."id", "s"."personal_owner_id", "i"."created_at"
FROM "items" AS "i"
JOIN "notes" AS "n" ON "n"."item_id" = "i"."id"
JOIN "items" AS "p" ON "p"."id" = "n"."parent_id"
JOIN "spaces" AS "s" ON "s"."id" = "i"."space_id"
WHERE "s"."personal_owner_id" IS NOT NULL AND "i"."kind" = 'note' AND "p"."title" = 'Weekly reviews' AND "p"."space_id" = "i"."space_id";

CREATE TEMP TABLE "moved" AS
SELECT "j"."note_id" AS "id", "j"."user_id" FROM "journal_entries" AS "j" JOIN "items" AS "i" ON "i"."id" = "j"."note_id" WHERE "i"."space_id" IS NOT NULL
UNION
SELECT "note_id", "user_id" FROM "weekly_reviews";

CREATE TEMP TABLE "old_parents" AS
SELECT DISTINCT "n"."parent_id" AS "id" FROM "notes" AS "n" JOIN "moved" AS "m" ON "m"."id" = "n"."item_id" WHERE "n"."parent_id" IS NOT NULL;

UPDATE "notes" SET "parent_id" = NULL, "position" = 0, "template" = false, "pinned_at" = NULL WHERE "item_id" IN (SELECT "id" FROM "moved");
UPDATE "notes" SET "parent_id" = NULL WHERE "parent_id" IN (SELECT "id" FROM "moved") AND "item_id" NOT IN (SELECT "id" FROM "moved");
DELETE FROM "item_tags" WHERE "item_id" IN (SELECT "id" FROM "moved");
DELETE FROM "activity_events" WHERE "item_id" IN (SELECT "id" FROM "moved");
DELETE FROM "page_grants" WHERE "item_id" IN (SELECT "id" FROM "moved");
DELETE FROM "share_links" WHERE "item_id" IN (SELECT "id" FROM "moved");
DELETE FROM "database_schemas" WHERE "item_id" IN (SELECT "id" FROM "moved");
UPDATE "items" AS "i" SET "owner_id" = "m"."user_id", "space_id" = NULL FROM "moved" AS "m" WHERE "i"."id" = "m"."id";

DELETE FROM "items" AS "p"
USING "old_parents" AS "o"
WHERE "p"."id" = "o"."id"
  AND "p"."title" IN ('Journal', 'Weekly reviews')
  AND NOT EXISTS (SELECT 1 FROM "notes" AS "c" WHERE "c"."parent_id" = "p"."id");

DROP TABLE "old_parents";
DROP TABLE "moved";
