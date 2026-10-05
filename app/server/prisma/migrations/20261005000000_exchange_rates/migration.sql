ALTER TABLE "users" ADD COLUMN "home_currency" TEXT;

CREATE TABLE "exchange_rates" (
    "currency" TEXT NOT NULL,
    "per_euro" DOUBLE PRECISION NOT NULL,
    "published_on" DATE NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("currency")
);
