-- AlterTable
ALTER TABLE "exchange_rates" DROP CONSTRAINT "exchange_rates_pkey",
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ECB',
ADD CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("currency", "published_on");

UPDATE "exchange_rates" SET "source" = 'CBE' WHERE "currency" = 'EGP';