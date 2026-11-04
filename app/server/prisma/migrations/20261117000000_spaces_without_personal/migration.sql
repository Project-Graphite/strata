-- Spaces without a personal space

ALTER TABLE "spaces" ADD COLUMN "slug" TEXT, ADD COLUMN "description" TEXT NOT NULL DEFAULT '', ADD COLUMN "defaults" JSONB NOT NULL DEFAULT '{}';

CREATE TEMP TABLE "personal" AS
SELECT "id" AS "space_id", "personal_owner_id" AS "user_id", "name"
FROM "spaces"
WHERE "personal_owner_id" IS NOT NULL;

CREATE TEMP TABLE "tag_merges" AS
SELECT "t"."id" AS "from_id", "o"."id" AS "to_id"
FROM "tags" AS "t"
JOIN "personal" AS "p" ON "p"."space_id" = "t"."space_id"
JOIN "tags" AS "o" ON "o"."owner_id" = "p"."user_id" AND lower("o"."name") = lower("t"."name");

INSERT INTO "item_tags" ("item_id", "tag_id")
SELECT "it"."item_id", "m"."to_id" FROM "item_tags" AS "it" JOIN "tag_merges" AS "m" ON "m"."from_id" = "it"."tag_id"
ON CONFLICT DO NOTHING;
UPDATE "tidy_rules" AS "r" SET "tag_id" = "m"."to_id" FROM "tag_merges" AS "m" WHERE "r"."tag_id" = "m"."from_id";
UPDATE "tidy_batches" AS "b" SET "tag_id" = "m"."to_id" FROM "tag_merges" AS "m" WHERE "b"."tag_id" = "m"."from_id";
DELETE FROM "tags" WHERE "id" IN (SELECT "from_id" FROM "tag_merges");
UPDATE "tags" AS "t" SET "owner_id" = "p"."user_id", "space_id" = NULL FROM "personal" AS "p" WHERE "t"."space_id" = "p"."space_id";

CREATE TEMP TABLE "personal_folders" AS
SELECT gen_random_uuid() AS "id", "p"."space_id", "p"."user_id", "p"."name"
FROM "personal" AS "p"
WHERE EXISTS (SELECT 1 FROM "items" AS "i" WHERE "i"."space_id" = "p"."space_id" AND "i"."kind" = 'file');

INSERT INTO "items" ("id", "owner_id", "kind", "title", "created_by", "updated_by", "created_at", "updated_at")
SELECT "id", "user_id", 'folder', "name", "user_id", "user_id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "personal_folders";

UPDATE "items" AS "i" SET "folder_id" = "f"."id"
FROM "personal_folders" AS "f"
WHERE "i"."space_id" = "f"."space_id" AND "i"."kind" = 'file' AND "i"."folder_id" IS NULL;

UPDATE "items" AS "i" SET "owner_id" = "p"."user_id", "space_id" = NULL FROM "personal" AS "p" WHERE "i"."space_id" = "p"."space_id";
UPDATE "search_documents" AS "d" SET "owner_id" = "p"."user_id", "space_id" = NULL FROM "personal" AS "p" WHERE "d"."space_id" = "p"."space_id";

ALTER TABLE "activity_events" ADD COLUMN "owner_id" UUID, ALTER COLUMN "space_id" DROP NOT NULL;
UPDATE "activity_events" AS "a" SET "owner_id" = "p"."user_id", "space_id" = NULL FROM "personal" AS "p" WHERE "a"."space_id" = "p"."space_id";
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_one_home_check" CHECK (("space_id" IS NULL) <> ("owner_id" IS NULL));
CREATE INDEX "activity_events_owner_id_created_at_idx" ON "activity_events"("owner_id", "created_at");
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tidy_rules" ALTER COLUMN "space_id" DROP NOT NULL;
UPDATE "tidy_rules" AS "r" SET "space_id" = NULL, "created_by" = "p"."user_id" FROM "personal" AS "p" WHERE "r"."space_id" = "p"."space_id";

UPDATE "access_tokens" AS "t" SET "space_id" = NULL, "revoked_at" = COALESCE("t"."revoked_at", CURRENT_TIMESTAMP) FROM "personal" AS "p" WHERE "t"."space_id" = "p"."space_id";
UPDATE "webhooks" AS "w" SET "space_id" = NULL, "active" = false FROM "personal" AS "p" WHERE "w"."space_id" = "p"."space_id";

DROP INDEX "task_columns_space_id_name_key";
ALTER TABLE "task_columns" ADD COLUMN "owner_id" UUID, ADD COLUMN "list_id" UUID, ALTER COLUMN "space_id" DROP NOT NULL;
UPDATE "task_columns" AS "c" SET "owner_id" = "p"."user_id", "space_id" = NULL FROM "personal" AS "p" WHERE "c"."space_id" = "p"."space_id";

CREATE TEMP TABLE "column_copies" AS
SELECT "c"."id" AS "column_id", "l"."id" AS "list_id", gen_random_uuid() AS "copy_id"
FROM "task_columns" AS "c"
JOIN "items" AS "l" ON "l"."kind" = 'list' AND ("l"."space_id" = "c"."space_id" OR "l"."owner_id" = "c"."owner_id")
WHERE "l"."trashed_at" IS NULL OR EXISTS (SELECT 1 FROM "tasks" AS "t" WHERE "t"."column_id" = "c"."id" AND "t"."list_id" = "l"."id");

INSERT INTO "task_columns" ("id", "space_id", "owner_id", "list_id", "name", "position", "created_at")
SELECT "cc"."copy_id", "c"."space_id", "c"."owner_id", "cc"."list_id", "c"."name", "c"."position", "c"."created_at"
FROM "column_copies" AS "cc" JOIN "task_columns" AS "c" ON "c"."id" = "cc"."column_id";

UPDATE "tasks" AS "t" SET "column_id" = "cc"."copy_id" FROM "column_copies" AS "cc" WHERE "t"."column_id" = "cc"."column_id" AND "t"."list_id" = "cc"."list_id";

ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_one_home_check" CHECK (("space_id" IS NULL) <> ("owner_id" IS NULL));
CREATE UNIQUE INDEX "task_columns_home_list_name_key" ON "task_columns"(COALESCE("space_id", "owner_id"), COALESCE("list_id", '00000000-0000-0000-0000-000000000000'::uuid), "name");
CREATE INDEX "task_columns_space_id_idx" ON "task_columns"("space_id");
CREATE INDEX "task_columns_owner_id_idx" ON "task_columns"("owner_id");
CREATE INDEX "task_columns_list_id_idx" ON "task_columns"("list_id");
ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_columns" ADD CONSTRAINT "task_columns_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DELETE FROM "spaces" WHERE "id" IN (SELECT "space_id" FROM "personal");
ALTER TABLE "spaces" DROP CONSTRAINT "spaces_personal_owner_id_fkey";
DROP INDEX "spaces_personal_owner_id_key";
ALTER TABLE "spaces" DROP COLUMN "personal_owner_id";

UPDATE "spaces" SET "slug" = substr(md5(random()::text || "id"::text), 1, 10);
DO $$
BEGIN
    WHILE EXISTS (SELECT 1 FROM "spaces" GROUP BY "slug" HAVING count(*) > 1) LOOP
        UPDATE "spaces" AS "s" SET "slug" = substr(md5(random()::text || "s"."id"::text), 1, 10)
        WHERE "s"."id" IN (
            SELECT "id" FROM (SELECT "id", row_number() OVER (PARTITION BY "slug" ORDER BY "id") AS "n" FROM "spaces") AS "ranked" WHERE "n" > 1
        );
    END LOOP;
END $$;
ALTER TABLE "spaces" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "spaces_slug_key" ON "spaces"("slug");

DROP TABLE "column_copies";
DROP TABLE "personal_folders";
DROP TABLE "tag_merges";
DROP TABLE "personal";
