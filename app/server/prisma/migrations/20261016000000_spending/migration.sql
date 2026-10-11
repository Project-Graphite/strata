ALTER TYPE "ItemKind" ADD VALUE 'expense';

CREATE TABLE "expenses" (
    "item_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "spent_on" DATE NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "payment_label" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("item_id")
);
CREATE INDEX "expenses_spent_on_idx" ON "expenses"("spent_on");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "budgets_space_id_category_key" ON "budgets"("space_id", "category");
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
