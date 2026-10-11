ALTER TYPE "ItemKind" ADD VALUE 'person';

CREATE TABLE "people" (
    "item_id" UUID NOT NULL,
    "relationship" TEXT,
    "birthday_month" SMALLINT,
    "birthday_day" SMALLINT,
    "birth_year" SMALLINT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "gift_ideas" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "people_pkey" PRIMARY KEY ("item_id")
);
CREATE INDEX "people_birthday_idx" ON "people"("birthday_month", "birthday_day");
ALTER TABLE "people" ADD CONSTRAINT "people_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
