UPDATE "users" SET "features" = ARRAY['tasks','agenda','pages','boards','bookmarks','journal','files','spending']::TEXT[] || "features";
ALTER TABLE "users" ALTER COLUMN "features" SET DEFAULT ARRAY['tasks','agenda','pages','boards','bookmarks','journal','files','spending']::TEXT[];
