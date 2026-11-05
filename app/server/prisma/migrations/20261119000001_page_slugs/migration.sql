-- Short addresses for pages and boards, like spaces have
ALTER TABLE "notes" ADD COLUMN "slug" TEXT NOT NULL DEFAULT substr(md5((random())::text || (clock_timestamp())::text), 1, 10);

DO $$
BEGIN
    WHILE EXISTS (SELECT 1 FROM "notes" GROUP BY "slug" HAVING count(*) > 1) LOOP
        UPDATE "notes" AS "n" SET "slug" = substr(md5(random()::text || "n"."item_id"::text), 1, 10)
        WHERE "n"."item_id" IN (
            SELECT "item_id" FROM (SELECT "item_id", row_number() OVER (PARTITION BY "slug" ORDER BY "item_id") AS "rank" FROM "notes") AS "ranked" WHERE "rank" > 1
        );
    END LOOP;
END $$;

CREATE UNIQUE INDEX "notes_slug_key" ON "notes"("slug");