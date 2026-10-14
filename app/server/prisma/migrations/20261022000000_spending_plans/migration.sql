-- CreateTable
CREATE TABLE "spending_plans" (
    "space_id" UUID NOT NULL,
    "budget_minor" INTEGER,
    "currency" TEXT,
    "start_day" INTEGER NOT NULL DEFAULT 1,
    "rollover" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spending_plans_pkey" PRIMARY KEY ("space_id")
);

-- CreateTable
CREATE TABLE "budget_alerts" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_alerts_space_id_category_period_level_key" ON "budget_alerts"("space_id", "category", "period", "level");

-- AddForeignKey
ALTER TABLE "spending_plans" ADD CONSTRAINT "spending_plans_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

