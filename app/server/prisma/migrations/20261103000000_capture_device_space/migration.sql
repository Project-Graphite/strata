-- AlterTable
ALTER TABLE "access_tokens" ADD COLUMN     "space_id" UUID;

-- CreateIndex
CREATE INDEX "access_tokens_space_id_idx" ON "access_tokens"("space_id");

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bind existing phone tokens to the personal space they were minted for
UPDATE "access_tokens" AS "token"
SET "space_id" = "space"."id"
FROM "spaces" AS "space"
WHERE "space"."personal_owner_id" = "token"."user_id"
  AND "token"."name" = 'Android phone (' || left("space"."id"::text, 8) || ')';