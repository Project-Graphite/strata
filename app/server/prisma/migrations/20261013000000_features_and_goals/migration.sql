ALTER TABLE "users" ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TYPE "ItemKind" ADD VALUE 'goal';

CREATE TABLE "goals" (
    "item_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "why" TEXT NOT NULL DEFAULT '',
    "target" DOUBLE PRECISION,
    "current" DOUBLE PRECISION,
    "unit" TEXT,
    CONSTRAINT "goals_pkey" PRIMARY KEY ("item_id")
);
CREATE INDEX "goals_ends_on_idx" ON "goals"("ends_on");
ALTER TABLE "goals" ADD CONSTRAINT "goals_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "goal_habits" (
    "goal_id" UUID NOT NULL,
    "habit_id" UUID NOT NULL,
    CONSTRAINT "goal_habits_pkey" PRIMARY KEY ("goal_id", "habit_id")
);
CREATE INDEX "goal_habits_habit_id_idx" ON "goal_habits"("habit_id");
ALTER TABLE "goal_habits" ADD CONSTRAINT "goal_habits_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_habits" ADD CONSTRAINT "goal_habits_habit_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
