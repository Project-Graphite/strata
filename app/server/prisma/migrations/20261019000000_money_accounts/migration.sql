-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "account_id" UUID,
ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'spent',
ADD COLUMN     "merchant" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "to_account_id" UUID;

-- CreateTable
CREATE TABLE "money_accounts" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'bank',
    "currency" TEXT NOT NULL,
    "card_digits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "senders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "balance_minor" INTEGER NOT NULL DEFAULT 0,
    "balance_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credit_limit_minor" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "money_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "money_accounts_space_id_idx" ON "money_accounts"("space_id");

-- CreateIndex
CREATE INDEX "expenses_account_id_idx" ON "expenses"("account_id");

-- CreateIndex
CREATE INDEX "expenses_to_account_id_idx" ON "expenses"("to_account_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "money_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

