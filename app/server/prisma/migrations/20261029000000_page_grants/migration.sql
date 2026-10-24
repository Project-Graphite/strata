CREATE TYPE "PageRole" AS ENUM ('view', 'comment', 'edit', 'manage');

CREATE TABLE "page_grants" (
    "item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "PageRole" NOT NULL DEFAULT 'view',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "page_grants_pkey" PRIMARY KEY ("item_id", "user_id")
);

CREATE INDEX "page_grants_user_id_idx" ON "page_grants"("user_id");

ALTER TABLE "page_grants" ADD CONSTRAINT "page_grants_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "page_grants" ADD CONSTRAINT "page_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "page_grants" ADD CONSTRAINT "page_grants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
