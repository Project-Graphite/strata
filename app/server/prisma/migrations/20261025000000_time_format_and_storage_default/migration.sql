ALTER TABLE "users" ADD COLUMN "time_format" TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE "site_settings" ALTER COLUMN "file_quota_mb" SET DEFAULT 150;
