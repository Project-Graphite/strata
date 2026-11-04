-- Email notifications
ALTER TABLE "users" ADD COLUMN     "email_kinds" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "inbox_notifications" ADD COLUMN     "emailed_at" TIMESTAMP(3);
