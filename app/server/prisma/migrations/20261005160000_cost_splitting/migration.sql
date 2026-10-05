CREATE TABLE "cost_splits" (
    "item_id" UUID NOT NULL,
    "payer_id" UUID NOT NULL,

    CONSTRAINT "cost_splits_pkey" PRIMARY KEY ("item_id")
);

CREATE TABLE "cost_shares" (
    "item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cost_shares_pkey" PRIMARY KEY ("item_id","user_id")
);

CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cost_splits_payer_id_idx" ON "cost_splits"("payer_id");

CREATE INDEX "cost_shares_user_id_idx" ON "cost_shares"("user_id");

CREATE INDEX "settlements_space_id_month_idx" ON "settlements"("space_id", "month");

ALTER TABLE "cost_splits" ADD CONSTRAINT "cost_splits_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_splits" ADD CONSTRAINT "cost_splits_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_shares" ADD CONSTRAINT "cost_shares_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "cost_splits"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_shares" ADD CONSTRAINT "cost_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

