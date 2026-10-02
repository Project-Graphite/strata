CREATE TABLE "subscriptions" (
    "item_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "repeat_rule" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "next_renewal" DATE NOT NULL,
    "time_zone" TEXT NOT NULL,
    "trial_ends_on" DATE,
    "notice_days" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'other',
    "payment_label" TEXT,
    "cancel_url" TEXT,
    "support_url" TEXT,
    "used_by" TEXT,
    "reminder_days" INTEGER,
    "last_used_on" DATE,
    "cancelled_on" DATE,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("item_id")
);

CREATE TABLE "subscription_prices" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscription_prices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscriptions_next_renewal_idx" ON "subscriptions"("next_renewal");

CREATE INDEX "subscription_prices_item_id_effective_from_idx" ON "subscription_prices"("item_id", "effective_from");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_prices" ADD CONSTRAINT "subscription_prices_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
