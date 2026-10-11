ALTER TYPE "ItemKind" ADD VALUE 'trip';

CREATE TABLE "trips" (
    "item_id" UUID NOT NULL,
    "destination" TEXT NOT NULL DEFAULT '',
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "budget_minor" INTEGER,
    "currency" TEXT,
    CONSTRAINT "trips_pkey" PRIMARY KEY ("item_id")
);
CREATE INDEX "trips_starts_on_idx" ON "trips"("starts_on");
ALTER TABLE "trips" ADD CONSTRAINT "trips_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
