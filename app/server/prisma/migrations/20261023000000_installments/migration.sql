-- AlterTable
ALTER TABLE "money_accounts" ADD COLUMN     "due_day" INTEGER,
ADD COLUMN     "due_reminded_on" DATE;

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "account_id" UUID,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "monthly_minor" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "first_due_on" DATE NOT NULL,
    "paid_count" INTEGER NOT NULL DEFAULT 0,
    "reminder_days" INTEGER NOT NULL DEFAULT 3,
    "reminded_on" DATE,
    "missed_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "installment_plans_space_id_idx" ON "installment_plans"("space_id");

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

