CREATE TABLE "habits" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "per_week" INTEGER NOT NULL DEFAULT 7,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "habit_check_ins" (
    "habit_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "habit_check_ins_pkey" PRIMARY KEY ("habit_id","user_id","day")
);

CREATE INDEX "habits_space_id_position_idx" ON "habits"("space_id", "position");

CREATE INDEX "habit_check_ins_user_id_day_idx" ON "habit_check_ins"("user_id", "day");

ALTER TABLE "habits" ADD CONSTRAINT "habits_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "habit_check_ins" ADD CONSTRAINT "habit_check_ins_habit_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "habit_check_ins" ADD CONSTRAINT "habit_check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
