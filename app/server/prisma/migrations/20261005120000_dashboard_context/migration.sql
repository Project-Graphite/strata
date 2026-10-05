ALTER TABLE "dashboards" ADD COLUMN "show_from" INTEGER,
ADD COLUMN "show_until" INTEGER,
ADD COLUMN "show_on" TEXT NOT NULL DEFAULT 'any';
