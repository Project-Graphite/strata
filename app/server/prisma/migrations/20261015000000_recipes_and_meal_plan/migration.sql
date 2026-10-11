ALTER TYPE "ItemKind" ADD VALUE 'recipe';

CREATE TABLE "recipes" (
    "item_id" UUID NOT NULL,
    "servings" INTEGER,
    "prep_minutes" INTEGER,
    "cook_minutes" INTEGER,
    "ingredients" JSONB NOT NULL DEFAULT '[]',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "source_url" TEXT,
    CONSTRAINT "recipes_pkey" PRIMARY KEY ("item_id")
);
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "meal_plan_entries" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "meal" TEXT NOT NULL,
    "recipe_id" UUID,
    "note" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meal_plan_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "meal_plan_entries_space_id_day_idx" ON "meal_plan_entries"("space_id", "day");
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
