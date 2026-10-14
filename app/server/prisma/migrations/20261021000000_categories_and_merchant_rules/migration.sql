-- CreateTable
CREATE TABLE "spending_categories" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT 'gray',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "spending_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_rules" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "match" TEXT NOT NULL,
    "rename" TEXT,
    "category" TEXT,
    "ignore" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spending_categories_space_id_name_key" ON "spending_categories"("space_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_rules_space_id_match_key" ON "merchant_rules"("space_id", "match");

-- AddForeignKey
ALTER TABLE "spending_categories" ADD CONSTRAINT "spending_categories_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

