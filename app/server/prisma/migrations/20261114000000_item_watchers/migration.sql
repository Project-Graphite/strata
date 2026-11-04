-- Item watchers

CREATE TABLE "item_watchers" (
    "item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_watchers_pkey" PRIMARY KEY ("item_id","user_id")
);

CREATE INDEX "item_watchers_user_id_idx" ON "item_watchers"("user_id");

ALTER TABLE "item_watchers" ADD CONSTRAINT "item_watchers_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "item_watchers" ADD CONSTRAINT "item_watchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
