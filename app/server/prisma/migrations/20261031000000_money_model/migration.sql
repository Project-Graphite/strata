ALTER TABLE "users" ADD COLUMN     "budgets_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "month_start_day" INTEGER NOT NULL DEFAULT 1;

UPDATE "users" u SET "month_start_day" = COALESCE(
  (SELECT p."start_day" FROM "spending_plans" p JOIN "spaces" s ON s."id" = p."space_id" WHERE s."personal_owner_id" = u."id"),
  (SELECT p."start_day" FROM "spending_plans" p JOIN "spaces" s ON s."id" = p."space_id" WHERE s."created_by" = u."id" AND s."personal_owner_id" IS NULL ORDER BY p."updated_at" DESC LIMIT 1),
  1
);

CREATE TABLE "account_balances" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "balance_minor" BIGINT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "account_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cards" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "last4" TEXT NOT NULL,
    "network" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'debit',
    "label" TEXT,
    "expires_on" DATE,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "icon" TEXT,
    "ignore" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sender_rules" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "pattern" TEXT NOT NULL,
    "account_id" UUID,
    "card_id" UUID,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sender_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_balances_account_id_recorded_at_idx" ON "account_balances"("account_id", "recorded_at");
CREATE UNIQUE INDEX "cards_account_id_last4_key" ON "cards"("account_id", "last4");
CREATE INDEX "merchants_space_id_idx" ON "merchants"("space_id");
CREATE INDEX "sender_rules_space_id_idx" ON "sender_rules"("space_id");

ALTER TABLE "money_accounts" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "colour" TEXT,
ADD COLUMN     "funded_by_account_id" UUID,
ADD COLUMN     "handle" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "institution" TEXT,
ALTER COLUMN "kind" SET DEFAULT 'bank_current',
ALTER COLUMN "balance_minor" SET DATA TYPE BIGINT,
ALTER COLUMN "credit_limit_minor" SET DATA TYPE BIGINT;

UPDATE "money_accounts" SET "kind" = CASE "kind" WHEN 'bank' THEN 'bank_current' WHEN 'credit' THEN 'credit_card' ELSE "kind" END;

INSERT INTO "cards" ("id", "account_id", "last4", "kind", "position", "created_at")
SELECT gen_random_uuid(), a."id", d."digits", CASE WHEN a."kind" = 'credit_card' THEN 'credit' ELSE 'debit' END, (d."ord" - 1)::INTEGER, a."created_at"
FROM "money_accounts" a CROSS JOIN LATERAL unnest(a."card_digits") WITH ORDINALITY AS d("digits", "ord")
ON CONFLICT ("account_id", "last4") DO NOTHING;

INSERT INTO "account_balances" ("id", "account_id", "balance_minor", "recorded_at", "source")
SELECT gen_random_uuid(), "id", "balance_minor", "balance_at", 'migration' FROM "money_accounts";

ALTER TABLE "money_accounts" DROP COLUMN "card_digits";

INSERT INTO "merchants" ("id", "space_id", "name", "aliases", "category", "ignore", "created_at", "updated_at")
SELECT "id", "space_id", COALESCE("rename", "match"), ARRAY["match"], "category", "ignore", "created_at", "created_at" FROM "merchant_rules";

ALTER TABLE "merchant_rules" DROP CONSTRAINT "merchant_rules_space_id_fkey";
DROP TABLE "merchant_rules";

ALTER TABLE "expenses" ADD COLUMN     "capture_id" UUID,
ADD COLUMN     "card_id" UUID,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'purchase',
ADD COLUMN     "merchant_id" UUID,
ADD COLUMN     "occurred_at" TIMESTAMPTZ(3),
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'posted',
ADD COLUMN     "transfer_pair_id" UUID,
ALTER COLUMN "amount_minor" SET DATA TYPE BIGINT;

UPDATE "expenses" SET "kind" = CASE "direction" WHEN 'received' THEN 'income' WHEN 'refund' THEN 'refund' WHEN 'transfer' THEN 'transfer' ELSE 'purchase' END;

UPDATE "expenses" e SET "card_id" = c."id" FROM "cards" c WHERE c."account_id" = e."account_id" AND c."last4" = e."card_digits";

UPDATE "expenses" e SET
  "capture_id" = m."id",
  "occurred_at" = m."received_at",
  "reference" = NULLIF(m."suggestion"->>'reference', ''),
  "kind" = CASE WHEN m."suggestion"->>'direction' = e."direction" AND m."suggestion"->>'movement' IN ('purchase', 'atm', 'fee', 'bill', 'transfer', 'card_payment', 'installment', 'salary', 'refund', 'income') THEN m."suggestion"->>'movement' ELSE e."kind" END
FROM (SELECT DISTINCT ON ("expense_id") "id", "expense_id", "received_at", "suggestion" FROM "captured_messages" WHERE "expense_id" IS NOT NULL ORDER BY "expense_id", "created_at") m
WHERE m."expense_id" = e."item_id";

CREATE UNIQUE INDEX "expenses_capture_id_key" ON "expenses"("capture_id");
CREATE INDEX "expenses_card_id_idx" ON "expenses"("card_id");
CREATE INDEX "expenses_merchant_id_idx" ON "expenses"("merchant_id");
CREATE INDEX "expenses_transfer_pair_id_idx" ON "expenses"("transfer_pair_id");

ALTER TABLE "captured_messages" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "parser_version" INTEGER,
ADD COLUMN     "template_id" TEXT,
ALTER COLUMN "text_sealed" DROP NOT NULL;

UPDATE "captured_messages" SET "template_id" = "suggestion"->>'templateId', "confidence" = ("suggestion"->>'confidence')::DOUBLE PRECISION;

ALTER TABLE "spending_categories" ADD COLUMN     "icon" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'expense';

WITH "defaults" ("name", "colour", "icon", "kind", "position") AS (
  VALUES
    ('groceries', 'green', 'checklist', 'expense', 0),
    ('eating out', 'orange', 'utensils', 'expense', 1),
    ('transport', 'blue', 'compass', 'expense', 2),
    ('housing', 'purple', 'home', 'expense', 3),
    ('utilities', 'yellow', 'repeat', 'expense', 4),
    ('health', 'red', 'shield', 'expense', 5),
    ('shopping', 'pink', 'tag', 'expense', 6),
    ('entertainment', 'teal', 'gamepad', 'expense', 7),
    ('travel', 'blue', 'plane', 'expense', 8),
    ('gifts', 'pink', 'gift', 'expense', 9),
    ('education', 'purple', 'library', 'expense', 10),
    ('other', 'gray', 'more', 'expense', 11),
    ('salary', 'green', 'wallet', 'income', 12),
    ('refund', 'teal', 'undo', 'income', 13),
    ('other income', 'gray', 'plus', 'income', 14)
),
"personal" AS (
  SELECT s."id",
    EXISTS (SELECT 1 FROM "spending_categories" c WHERE c."space_id" = s."id") AS "customised",
    COALESCE((SELECT MAX(c."position") + 1 FROM "spending_categories" c WHERE c."space_id" = s."id"), 0) AS "next"
  FROM "spaces" s WHERE s."personal_owner_id" IS NOT NULL
)
INSERT INTO "spending_categories" ("id", "space_id", "name", "colour", "icon", "kind", "position")
SELECT gen_random_uuid(), p."id", d."name", d."colour", d."icon", d."kind", CASE WHEN p."customised" THEN p."next" + d."position" - 12 ELSE d."position" END
FROM "personal" p CROSS JOIN "defaults" d
WHERE NOT p."customised" OR d."kind" = 'income'
ON CONFLICT ("space_id", "name") DO NOTHING;

UPDATE "spending_categories" c SET "icon" = d."icon"
FROM (VALUES ('groceries', 'checklist'), ('eating out', 'utensils'), ('transport', 'compass'), ('housing', 'home'), ('utilities', 'repeat'), ('health', 'shield'), ('shopping', 'tag'), ('entertainment', 'gamepad'), ('travel', 'plane'), ('gifts', 'gift'), ('education', 'library'), ('other', 'more')) AS d("name", "icon")
WHERE c."name" = d."name" AND c."icon" IS NULL;

ALTER TABLE "spending_plans" DROP COLUMN "start_day",
ALTER COLUMN "budget_minor" SET DATA TYPE BIGINT;

ALTER TABLE "budgets" ALTER COLUMN "amount_minor" SET DATA TYPE BIGINT;
ALTER TABLE "installment_plans" ALTER COLUMN "monthly_minor" SET DATA TYPE BIGINT;
ALTER TABLE "savings_goals" ALTER COLUMN "target_minor" SET DATA TYPE BIGINT,
ALTER COLUMN "saved_minor" SET DATA TYPE BIGINT;
ALTER TABLE "assets" ALTER COLUMN "value_minor" SET DATA TYPE BIGINT;

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captured_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_funded_by_account_id_fkey" FOREIGN KEY ("funded_by_account_id") REFERENCES "money_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cards" ADD CONSTRAINT "cards_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sender_rules" ADD CONSTRAINT "sender_rules_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sender_rules" ADD CONSTRAINT "sender_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sender_rules" ADD CONSTRAINT "sender_rules_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
