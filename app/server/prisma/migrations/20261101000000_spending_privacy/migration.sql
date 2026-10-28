CREATE TABLE "spending_backup" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "row" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spending_backup_pkey" PRIMARY KEY ("id")
);

WITH "gone" AS (
  DELETE FROM "cost_splits" cs USING "items" i
  WHERE i."id" = cs."item_id" AND i."kind" = 'expense'
  RETURNING cs.*
)
INSERT INTO "spending_backup" ("id", "source", "row")
SELECT gen_random_uuid(), 'cost_splits', to_jsonb(g) || jsonb_build_object('shares', COALESCE((SELECT jsonb_agg(to_jsonb(sh)) FROM "cost_shares" sh WHERE sh."item_id" = g."item_id"), '[]'::jsonb))
FROM "gone" g;

CREATE TEMP TABLE "shared_owner" AS
SELECT s."id" AS "space_id", p."id" AS "personal_id"
FROM "spaces" s
JOIN "spaces" p ON p."personal_owner_id" = COALESCE(
  (SELECT u."id" FROM "users" u WHERE u."id" = s."created_by"),
  (SELECT m."user_id" FROM "space_members" m WHERE m."space_id" = s."id" ORDER BY m."role" = 'owner' DESC, m."joined_at" LIMIT 1)
)
WHERE s."personal_owner_id" IS NULL;

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
)
INSERT INTO "spending_categories" ("id", "space_id", "name", "colour", "icon", "kind", "position")
SELECT gen_random_uuid(), s."id", d."name", d."colour", d."icon", d."kind", d."position"
FROM "spaces" s CROSS JOIN "defaults" d
WHERE s."personal_owner_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "spending_categories" c WHERE c."space_id" = s."id");

CREATE TEMP TABLE "moved_items" AS
SELECT i."id" AS "item_id", COALESCE(creator."id", so."personal_id") AS "to_space"
FROM "items" i
JOIN "spaces" s ON s."id" = i."space_id" AND s."personal_owner_id" IS NULL
LEFT JOIN "spaces" creator ON creator."personal_owner_id" = i."created_by"
LEFT JOIN "shared_owner" so ON so."space_id" = i."space_id"
WHERE i."kind" = 'expense' AND COALESCE(creator."id", so."personal_id") IS NOT NULL;

WITH "gone" AS (
  DELETE FROM "item_tags" t USING "moved_items" m WHERE t."item_id" = m."item_id" RETURNING t.*
)
INSERT INTO "spending_backup" ("id", "source", "row") SELECT gen_random_uuid(), 'item_tags', to_jsonb(g) FROM "gone" g;

UPDATE "items" i SET "space_id" = m."to_space" FROM "moved_items" m WHERE i."id" = m."item_id";
UPDATE "search_documents" d SET "space_id" = m."to_space" FROM "moved_items" m WHERE d."item_id" = m."item_id";
UPDATE "activity_events" a SET "space_id" = m."to_space" FROM "moved_items" m WHERE a."item_id" = m."item_id";

UPDATE "money_accounts" a SET "space_id" = so."personal_id" FROM "shared_owner" so WHERE a."space_id" = so."space_id";
UPDATE "installment_plans" p SET "space_id" = so."personal_id" FROM "shared_owner" so WHERE p."space_id" = so."space_id";
UPDATE "savings_goals" g SET "space_id" = so."personal_id" FROM "shared_owner" so WHERE g."space_id" = so."space_id";
UPDATE "assets" a SET "space_id" = so."personal_id" FROM "shared_owner" so WHERE a."space_id" = so."space_id";
UPDATE "merchants" m SET "space_id" = so."personal_id" FROM "shared_owner" so WHERE m."space_id" = so."space_id";
UPDATE "sender_rules" r SET "space_id" = so."personal_id" FROM "shared_owner" so WHERE r."space_id" = so."space_id";

WITH "gone" AS (
  DELETE FROM "budgets" b USING "shared_owner" so
  WHERE b."space_id" = so."space_id" AND (
    EXISTS (SELECT 1 FROM "budgets" x WHERE x."space_id" = so."personal_id" AND x."category" = b."category")
    OR EXISTS (SELECT 1 FROM "budgets" y JOIN "shared_owner" yo ON yo."space_id" = y."space_id" WHERE yo."personal_id" = so."personal_id" AND y."category" = b."category" AND (y."updated_at", y."id") > (b."updated_at", b."id"))
  )
  RETURNING b.*
)
INSERT INTO "spending_backup" ("id", "source", "row") SELECT gen_random_uuid(), 'budgets', to_jsonb(g) FROM "gone" g;
UPDATE "budgets" b SET "space_id" = so."personal_id" FROM "shared_owner" so WHERE b."space_id" = so."space_id";

WITH "gone" AS (
  DELETE FROM "spending_plans" p USING "shared_owner" so
  WHERE p."space_id" = so."space_id" AND (
    EXISTS (SELECT 1 FROM "spending_plans" x WHERE x."space_id" = so."personal_id")
    OR EXISTS (SELECT 1 FROM "spending_plans" y JOIN "shared_owner" yo ON yo."space_id" = y."space_id" WHERE yo."personal_id" = so."personal_id" AND (y."updated_at", y."space_id") > (p."updated_at", p."space_id"))
  )
  RETURNING p.*
)
INSERT INTO "spending_backup" ("id", "source", "row") SELECT gen_random_uuid(), 'spending_plans', to_jsonb(g) FROM "gone" g;
UPDATE "spending_plans" p SET "space_id" = so."personal_id" FROM "shared_owner" so WHERE p."space_id" = so."space_id";

WITH "gone" AS (
  DELETE FROM "budget_alerts" a USING "shared_owner" so
  WHERE a."space_id" = so."space_id" AND (
    EXISTS (SELECT 1 FROM "budget_alerts" x WHERE x."space_id" = so."personal_id" AND x."category" = a."category" AND x."period" = a."period" AND x."level" = a."level")
    OR EXISTS (SELECT 1 FROM "budget_alerts" y JOIN "shared_owner" yo ON yo."space_id" = y."space_id" WHERE yo."personal_id" = so."personal_id" AND y."category" = a."category" AND y."period" = a."period" AND y."level" = a."level" AND (y."created_at", y."id") < (a."created_at", a."id"))
  )
  RETURNING a.*
)
INSERT INTO "spending_backup" ("id", "source", "row") SELECT gen_random_uuid(), 'budget_alerts', to_jsonb(g) FROM "gone" g;
UPDATE "budget_alerts" a SET "space_id" = so."personal_id" FROM "shared_owner" so WHERE a."space_id" = so."space_id";

WITH "gone" AS (
  DELETE FROM "spending_categories" c USING "shared_owner" so
  WHERE c."space_id" = so."space_id" AND (
    EXISTS (SELECT 1 FROM "spending_categories" x WHERE x."space_id" = so."personal_id" AND x."name" = c."name")
    OR EXISTS (SELECT 1 FROM "spending_categories" y JOIN "shared_owner" yo ON yo."space_id" = y."space_id" WHERE yo."personal_id" = so."personal_id" AND y."name" = c."name" AND y."id" < c."id")
  )
  RETURNING c.*
)
INSERT INTO "spending_backup" ("id", "source", "row") SELECT gen_random_uuid(), 'spending_categories', to_jsonb(g) FROM "gone" g;
UPDATE "spending_categories" c SET "space_id" = so."personal_id", "position" = c."position" + 100 FROM "shared_owner" so WHERE c."space_id" = so."space_id";

INSERT INTO "spending_categories" ("id", "space_id", "name", "colour", "kind", "position")
SELECT gen_random_uuid(), u."space_id", u."category", 'gray', 'expense', 200 + ROW_NUMBER() OVER (PARTITION BY u."space_id" ORDER BY u."category")
FROM (SELECT DISTINCT i."space_id", e."category" FROM "expenses" e JOIN "items" i ON i."id" = e."item_id" JOIN "moved_items" m ON m."item_id" = i."id") u
WHERE NOT EXISTS (SELECT 1 FROM "spending_categories" c WHERE c."space_id" = u."space_id" AND c."name" = u."category");

WITH "gone" AS (
  DELETE FROM "captured_messages" c USING "spaces" s, "spaces" p
  WHERE s."id" = c."space_id" AND s."personal_owner_id" IS NULL AND p."personal_owner_id" = c."user_id" AND (
    EXISTS (SELECT 1 FROM "captured_messages" x WHERE x."space_id" = p."id" AND x."hash" = c."hash")
    OR EXISTS (SELECT 1 FROM "captured_messages" y JOIN "spaces" ys ON ys."id" = y."space_id" AND ys."personal_owner_id" IS NULL WHERE y."user_id" = c."user_id" AND y."hash" = c."hash" AND (y."created_at", y."id") < (c."created_at", c."id"))
  )
  RETURNING c.*
)
INSERT INTO "spending_backup" ("id", "source", "row") SELECT gen_random_uuid(), 'captured_messages', to_jsonb(g) FROM "gone" g;
UPDATE "captured_messages" c SET "space_id" = p."id" FROM "spaces" s, "spaces" p WHERE s."id" = c."space_id" AND s."personal_owner_id" IS NULL AND p."personal_owner_id" = c."user_id";

INSERT INTO "spending_backup" ("id", "source", "row")
SELECT gen_random_uuid(), 'expense_links', jsonb_build_object('item_id', e."item_id", 'account_id', e."account_id", 'to_account_id', e."to_account_id", 'card_id', e."card_id", 'merchant_id', e."merchant_id")
FROM "expenses" e
JOIN "items" i ON i."id" = e."item_id"
LEFT JOIN "money_accounts" a ON a."id" = e."account_id"
LEFT JOIN "money_accounts" t ON t."id" = e."to_account_id"
LEFT JOIN "cards" c ON c."id" = e."card_id"
LEFT JOIN "money_accounts" ca ON ca."id" = c."account_id"
LEFT JOIN "merchants" m ON m."id" = e."merchant_id"
WHERE a."space_id" <> i."space_id" OR t."space_id" <> i."space_id" OR ca."space_id" <> i."space_id" OR m."space_id" <> i."space_id";

UPDATE "expenses" e SET "account_id" = NULL FROM "items" i, "money_accounts" a WHERE i."id" = e."item_id" AND a."id" = e."account_id" AND a."space_id" <> i."space_id";
UPDATE "expenses" e SET "to_account_id" = NULL FROM "items" i, "money_accounts" a WHERE i."id" = e."item_id" AND a."id" = e."to_account_id" AND a."space_id" <> i."space_id";
UPDATE "expenses" e SET "card_id" = NULL FROM "items" i, "cards" c, "money_accounts" a WHERE i."id" = e."item_id" AND c."id" = e."card_id" AND a."id" = c."account_id" AND a."space_id" <> i."space_id";
UPDATE "expenses" e SET "merchant_id" = NULL FROM "items" i, "merchants" m WHERE i."id" = e."item_id" AND m."id" = e."merchant_id" AND m."space_id" <> i."space_id";

DROP TABLE "moved_items";
DROP TABLE "shared_owner";
