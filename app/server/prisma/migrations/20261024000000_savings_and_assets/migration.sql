-- CreateTable
CREATE TABLE "savings_goals" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "account_id" UUID,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "target_minor" INTEGER NOT NULL,
    "saved_minor" INTEGER NOT NULL DEFAULT 0,
    "due_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "currency" TEXT NOT NULL,
    "value_minor" INTEGER NOT NULL,
    "rate_percent" DOUBLE PRECISION,
    "matures_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "savings_goals_space_id_idx" ON "savings_goals"("space_id");

-- CreateIndex
CREATE INDEX "assets_space_id_idx" ON "assets"("space_id");

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

