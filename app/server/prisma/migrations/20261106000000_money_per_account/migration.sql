-- Money per account

CREATE TEMP TABLE "space_owners" AS
SELECT "s"."id" AS "space_id",
       COALESCE(
         "s"."personal_owner_id",
         "s"."created_by",
         (SELECT "m"."user_id" FROM "space_members" AS "m" WHERE "m"."space_id" = "s"."id" AND "m"."role" = 'owner' ORDER BY "m"."joined_at" LIMIT 1)
       ) AS "user_id"
FROM "spaces" AS "s";

ALTER TABLE "expenses" DROP CONSTRAINT "expenses_item_id_fkey";
ALTER TABLE "expenses" RENAME COLUMN "item_id" TO "id";
ALTER TABLE "expenses"
  ADD COLUMN "user_id" UUID,
  ADD COLUMN "title" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "trashed_at" TIMESTAMP(3),
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3);
UPDATE "expenses" AS "e"
SET "user_id" = COALESCE("i"."created_by", "o"."user_id"),
    "title" = "i"."title",
    "trashed_at" = "i"."trashed_at",
    "created_at" = "i"."created_at",
    "updated_at" = "i"."updated_at"
FROM "items" AS "i"
LEFT JOIN "space_owners" AS "o" ON "o"."space_id" = "i"."space_id"
WHERE "i"."id" = "e"."id";
DELETE FROM "expenses" WHERE "user_id" IS NULL;
UPDATE "expenses" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;
ALTER TABLE "expenses" ALTER COLUMN "user_id" SET NOT NULL, ALTER COLUMN "updated_at" SET NOT NULL;
DROP INDEX "expenses_spent_on_idx";
CREATE INDEX "expenses_user_id_spent_on_idx" ON "expenses"("user_id", "spent_on");
CREATE INDEX "expenses_user_id_trashed_at_idx" ON "expenses"("user_id", "trashed_at");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_item_id_fkey";
ALTER TABLE "subscriptions" RENAME COLUMN "item_id" TO "id";
ALTER TABLE "subscriptions"
  ADD COLUMN "user_id" UUID,
  ADD COLUMN "name" TEXT,
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3);
UPDATE "subscriptions" AS "s"
SET "user_id" = COALESCE("i"."created_by", "o"."user_id"),
    "name" = "i"."title",
    "created_at" = "i"."created_at",
    "updated_at" = "i"."updated_at"
FROM "items" AS "i"
LEFT JOIN "space_owners" AS "o" ON "o"."space_id" = "i"."space_id"
WHERE "i"."id" = "s"."id";
DELETE FROM "subscriptions" WHERE "user_id" IS NULL;
UPDATE "subscriptions" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;
ALTER TABLE "subscriptions"
  ALTER COLUMN "user_id" SET NOT NULL,
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_prices" DROP CONSTRAINT "subscription_prices_item_id_fkey";
DROP INDEX "subscription_prices_item_id_effective_from_idx";
ALTER TABLE "subscription_prices" RENAME COLUMN "item_id" TO "subscription_id";
DELETE FROM "subscription_prices" WHERE "subscription_id" NOT IN (SELECT "id" FROM "subscriptions");
CREATE INDEX "subscription_prices_subscription_id_effective_from_idx" ON "subscription_prices"("subscription_id", "effective_from");
ALTER TABLE "subscription_prices" ADD CONSTRAINT "subscription_prices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "scheduled_jobs"
SET "payload" = ("payload" - 'itemId') || jsonb_build_object('subscriptionId', "payload" -> 'itemId')
WHERE "kind" = 'subscription.reminder' AND "payload" ? 'itemId';

ALTER TABLE "captured_messages" DROP CONSTRAINT "captured_messages_space_id_fkey";
ALTER TABLE "captured_messages" DROP CONSTRAINT "captured_messages_expense_id_fkey";
DROP INDEX "captured_messages_space_id_status_idx";
DROP INDEX "captured_messages_space_id_hash_key";
ALTER TABLE "captured_messages" DROP COLUMN "space_id";
DELETE FROM "captured_messages" AS "c"
USING "captured_messages" AS "newer"
WHERE "c"."user_id" = "newer"."user_id" AND "c"."hash" = "newer"."hash" AND "c"."created_at" < "newer"."created_at";
UPDATE "captured_messages" SET "expense_id" = NULL WHERE "expense_id" IS NOT NULL AND "expense_id" NOT IN (SELECT "id" FROM "expenses");
CREATE INDEX "captured_messages_user_id_status_idx" ON "captured_messages"("user_id", "status");
CREATE INDEX "captured_messages_expense_id_idx" ON "captured_messages"("expense_id");
CREATE UNIQUE INDEX "captured_messages_user_id_hash_key" ON "captured_messages"("user_id", "hash");
ALTER TABLE "captured_messages" ADD CONSTRAINT "captured_messages_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "money_accounts" DROP CONSTRAINT "money_accounts_space_id_fkey";
DROP INDEX "money_accounts_space_id_idx";
ALTER TABLE "money_accounts" ADD COLUMN "user_id" UUID;
UPDATE "money_accounts" AS "t" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "t"."space_id";
DELETE FROM "money_accounts" WHERE "user_id" IS NULL;
ALTER TABLE "money_accounts" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE INDEX "money_accounts_user_id_idx" ON "money_accounts"("user_id");
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "merchants" DROP CONSTRAINT "merchants_space_id_fkey";
DROP INDEX "merchants_space_id_idx";
ALTER TABLE "merchants" ADD COLUMN "user_id" UUID;
UPDATE "merchants" AS "t" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "t"."space_id";
DELETE FROM "merchants" WHERE "user_id" IS NULL;
ALTER TABLE "merchants" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE INDEX "merchants_user_id_idx" ON "merchants"("user_id");
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sender_rules" DROP CONSTRAINT "sender_rules_space_id_fkey";
DROP INDEX "sender_rules_space_id_idx";
ALTER TABLE "sender_rules" ADD COLUMN "user_id" UUID;
UPDATE "sender_rules" AS "t" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "t"."space_id";
DELETE FROM "sender_rules" WHERE "user_id" IS NULL;
ALTER TABLE "sender_rules" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE INDEX "sender_rules_user_id_idx" ON "sender_rules"("user_id");
ALTER TABLE "sender_rules" ADD CONSTRAINT "sender_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "budgets" DROP CONSTRAINT "budgets_space_id_fkey";
DROP INDEX "budgets_space_id_category_key";
ALTER TABLE "budgets" ADD COLUMN "user_id" UUID;
UPDATE "budgets" AS "t" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "t"."space_id";
DELETE FROM "budgets" WHERE "user_id" IS NULL;
DELETE FROM "budgets" AS "b"
USING "budgets" AS "newer"
WHERE "b"."user_id" = "newer"."user_id" AND "b"."category" = "newer"."category" AND "b"."updated_at" < "newer"."updated_at";
ALTER TABLE "budgets" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE UNIQUE INDEX "budgets_user_id_category_key" ON "budgets"("user_id", "category");
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spending_categories" DROP CONSTRAINT "spending_categories_space_id_fkey";
DROP INDEX "spending_categories_space_id_name_key";
ALTER TABLE "spending_categories" ADD COLUMN "user_id" UUID;
UPDATE "spending_categories" AS "t" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "t"."space_id";
DELETE FROM "spending_categories" WHERE "user_id" IS NULL;
DELETE FROM "spending_categories" AS "c"
USING "spending_categories" AS "kept"
WHERE "c"."user_id" = "kept"."user_id" AND "c"."name" = "kept"."name" AND "c"."id" > "kept"."id";
ALTER TABLE "spending_categories" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE UNIQUE INDEX "spending_categories_user_id_name_key" ON "spending_categories"("user_id", "name");
ALTER TABLE "spending_categories" ADD CONSTRAINT "spending_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spending_plans" DROP CONSTRAINT "spending_plans_space_id_fkey";
ALTER TABLE "spending_plans" ADD COLUMN "user_id" UUID;
UPDATE "spending_plans" AS "t" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "t"."space_id";
DELETE FROM "spending_plans" WHERE "user_id" IS NULL;
DELETE FROM "spending_plans" AS "p"
USING "spending_plans" AS "newer"
WHERE "p"."user_id" = "newer"."user_id" AND "p"."updated_at" < "newer"."updated_at";
ALTER TABLE "spending_plans" DROP CONSTRAINT "spending_plans_pkey";
ALTER TABLE "spending_plans" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "spending_plans" ADD CONSTRAINT "spending_plans_pkey" PRIMARY KEY ("user_id");
ALTER TABLE "spending_plans" ADD CONSTRAINT "spending_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "budget_alerts" DROP CONSTRAINT "budget_alerts_space_id_fkey";
DROP INDEX "budget_alerts_space_id_category_period_level_key";
ALTER TABLE "budget_alerts" ADD COLUMN "user_id" UUID;
UPDATE "budget_alerts" AS "t" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "t"."space_id";
DELETE FROM "budget_alerts" WHERE "user_id" IS NULL;
DELETE FROM "budget_alerts" AS "a"
USING "budget_alerts" AS "kept"
WHERE "a"."user_id" = "kept"."user_id" AND "a"."category" = "kept"."category" AND "a"."period" = "kept"."period" AND "a"."level" = "kept"."level" AND "a"."id" > "kept"."id";
ALTER TABLE "budget_alerts" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE UNIQUE INDEX "budget_alerts_user_id_category_period_level_key" ON "budget_alerts"("user_id", "category", "period", "level");
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "installment_plans" DROP CONSTRAINT "installment_plans_space_id_fkey";
DROP INDEX "installment_plans_space_id_idx";
ALTER TABLE "installment_plans" ADD COLUMN "user_id" UUID;
UPDATE "installment_plans" AS "t" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "t"."space_id";
DELETE FROM "installment_plans" WHERE "user_id" IS NULL;
ALTER TABLE "installment_plans" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE INDEX "installment_plans_user_id_idx" ON "installment_plans"("user_id");
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "savings_goals" DROP CONSTRAINT "savings_goals_space_id_fkey";
DROP INDEX "savings_goals_space_id_idx";
ALTER TABLE "savings_goals" ADD COLUMN "user_id" UUID;
UPDATE "savings_goals" AS "t" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "t"."space_id";
DELETE FROM "savings_goals" WHERE "user_id" IS NULL;
ALTER TABLE "savings_goals" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE INDEX "savings_goals_user_id_idx" ON "savings_goals"("user_id");
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assets" DROP CONSTRAINT "assets_space_id_fkey";
DROP INDEX "assets_space_id_idx";
ALTER TABLE "assets" ADD COLUMN "user_id" UUID;
UPDATE "assets" AS "t" SET "user_id" = "o"."user_id" FROM "space_owners" AS "o" WHERE "o"."space_id" = "t"."space_id";
DELETE FROM "assets" WHERE "user_id" IS NULL;
ALTER TABLE "assets" DROP COLUMN "space_id", ALTER COLUMN "user_id" SET NOT NULL;
CREATE INDEX "assets_user_id_idx" ON "assets"("user_id");
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "cost_shares";
DROP TABLE "cost_splits";
DROP TABLE "settlements";
DROP TABLE "trips";

DELETE FROM "tidy_batches" WHERE "action" = 'cancel';
DELETE FROM "activity_events" WHERE "verb" LIKE 'subscription.%';
DELETE FROM "items" WHERE "kind" IN ('expense', 'subscription', 'trip');
UPDATE "tidy_rules" SET "kind" = NULL WHERE "kind" IN ('expense', 'subscription', 'trip');
UPDATE "users" SET "features" = array_remove("features", 'trips') WHERE 'trips' = ANY("features");
DROP TABLE "space_owners";

-- AlterEnum
BEGIN;
CREATE TYPE "ItemKind_new" AS ENUM ('note', 'task', 'event', 'board', 'file', 'list', 'bookmark', 'goal', 'person', 'recipe');
ALTER TABLE "items" ALTER COLUMN "kind" TYPE "ItemKind_new" USING ("kind"::text::"ItemKind_new");
ALTER TABLE "tidy_rules" ALTER COLUMN "kind" TYPE "ItemKind_new" USING ("kind"::text::"ItemKind_new");
ALTER TYPE "ItemKind" RENAME TO "ItemKind_old";
ALTER TYPE "ItemKind_new" RENAME TO "ItemKind";
DROP TYPE "ItemKind_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TidyAction_new" AS ENUM ('archive', 'trash', 'tag');
ALTER TABLE "tidy_batches" ALTER COLUMN "action" TYPE "TidyAction_new" USING ("action"::text::"TidyAction_new");
ALTER TYPE "TidyAction" RENAME TO "TidyAction_old";
ALTER TYPE "TidyAction_new" RENAME TO "TidyAction";
DROP TYPE "TidyAction_old";
COMMIT;
