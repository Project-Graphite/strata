-- Account items

CREATE TEMP TABLE "space_owners" AS
SELECT "s"."id" AS "space_id",
       COALESCE(
         "s"."personal_owner_id",
         "s"."created_by",
         (SELECT "m"."user_id" FROM "space_members" AS "m" WHERE "m"."space_id" = "s"."id" AND "m"."role" = 'owner' ORDER BY "m"."joined_at" LIMIT 1)
       ) AS "user_id"
FROM "spaces" AS "s";

ALTER TABLE "search_documents" DROP CONSTRAINT "search_documents_space_id_fkey";
ALTER TABLE "search_documents" ADD COLUMN "owner_id" UUID, ALTER COLUMN "space_id" DROP NOT NULL;

CREATE OR REPLACE FUNCTION "sync_search_document"() RETURNS trigger AS $$
BEGIN
    INSERT INTO "search_documents" ("item_id", "space_id", "owner_id", "title", "updated_at")
    VALUES (NEW."id", NEW."space_id", NEW."owner_id", NEW."title", CURRENT_TIMESTAMP)
    ON CONFLICT ("item_id") DO UPDATE
        SET "space_id" = EXCLUDED."space_id", "owner_id" = EXCLUDED."owner_id", "title" = EXCLUDED."title", "updated_at" = EXCLUDED."updated_at";
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE "items" ADD COLUMN "owner_id" UUID, ALTER COLUMN "space_id" DROP NOT NULL;

DROP TRIGGER "items_sync_search_document" ON "items";
CREATE TRIGGER "items_sync_search_document"
    AFTER INSERT OR UPDATE OF "title", "space_id", "owner_id" ON "items"
    FOR EACH ROW EXECUTE FUNCTION "sync_search_document"();

UPDATE "items" AS "i"
SET "owner_id" = COALESCE("i"."created_by", "o"."user_id")
FROM "space_owners" AS "o"
WHERE "o"."space_id" = "i"."space_id" AND "i"."kind" IN ('event', 'bookmark', 'goal', 'person', 'recipe');
DELETE FROM "items" WHERE "kind" IN ('event', 'bookmark', 'goal', 'person', 'recipe') AND "owner_id" IS NULL;
DELETE FROM "item_tags" AS "t" USING "items" AS "i" WHERE "i"."id" = "t"."item_id" AND "i"."owner_id" IS NOT NULL;
DELETE FROM "activity_events" AS "a" USING "items" AS "i" WHERE "i"."id" = "a"."item_id" AND "i"."owner_id" IS NOT NULL;
UPDATE "items" SET "space_id" = NULL WHERE "owner_id" IS NOT NULL;
UPDATE "search_documents" AS "d" SET "owner_id" = "i"."owner_id", "space_id" = NULL FROM "items" AS "i" WHERE "i"."id" = "d"."item_id" AND "i"."owner_id" IS NOT NULL;

ALTER TABLE "items" ADD CONSTRAINT "items_one_home_check" CHECK (("space_id" IS NULL) <> ("owner_id" IS NULL));
CREATE INDEX "items_owner_id_kind_updated_at_idx" ON "items"("owner_id", "kind", "updated_at");
ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_one_home_check" CHECK (("space_id" IS NULL) <> ("owner_id" IS NULL));
CREATE INDEX "search_documents_owner_id_idx" ON "search_documents"("owner_id");
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tags" ADD COLUMN "owner_id" UUID, ALTER COLUMN "space_id" DROP NOT NULL;
ALTER TABLE "tags" ADD CONSTRAINT "tags_one_home_check" CHECK (("space_id" IS NULL) <> ("owner_id" IS NULL));
CREATE UNIQUE INDEX "tags_owner_id_lower_name_key" ON "tags"("owner_id", lower("name"));
CREATE INDEX "tags_owner_id_idx" ON "tags"("owner_id");
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "tidy_rules" SET "kind" = NULL WHERE "kind" IN ('event', 'bookmark', 'goal', 'person', 'recipe');

ALTER TABLE "habits" DROP CONSTRAINT "habits_space_id_fkey";
DROP INDEX "habits_space_id_position_idx";
ALTER TABLE "habits" ADD COLUMN "user_id" UUID;
UPDATE "habits" AS "h" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "h"."space_id";
DELETE FROM "habits" WHERE "user_id" IS NULL;
ALTER TABLE "habits" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE INDEX "habits_user_id_position_idx" ON "habits"("user_id", "position");
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_subscriptions" DROP CONSTRAINT "calendar_subscriptions_space_id_fkey";
ALTER TABLE "calendar_subscriptions" DROP CONSTRAINT "calendar_subscriptions_created_by_fkey";
DROP INDEX "calendar_subscriptions_space_id_idx";
ALTER TABLE "calendar_subscriptions" ADD COLUMN "user_id" UUID;
UPDATE "calendar_subscriptions" AS "c" SET "user_id" = COALESCE("c"."created_by", "o"."user_id") FROM "space_owners" AS "o" WHERE "o"."space_id" = "c"."space_id";
DELETE FROM "calendar_subscriptions" WHERE "user_id" IS NULL;
ALTER TABLE "calendar_subscriptions" DROP COLUMN "created_by", DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE INDEX "calendar_subscriptions_user_id_idx" ON "calendar_subscriptions"("user_id");
ALTER TABLE "calendar_subscriptions" ADD CONSTRAINT "calendar_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meal_plan_entries" DROP CONSTRAINT "meal_plan_entries_space_id_fkey";
DROP INDEX "meal_plan_entries_space_id_day_idx";
ALTER TABLE "meal_plan_entries" ADD COLUMN "user_id" UUID;
UPDATE "meal_plan_entries" AS "m" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "m"."space_id";
DELETE FROM "meal_plan_entries" WHERE "user_id" IS NULL;
ALTER TABLE "meal_plan_entries" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE INDEX "meal_plan_entries_user_id_day_idx" ON "meal_plan_entries"("user_id", "day");
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "space_owners";
