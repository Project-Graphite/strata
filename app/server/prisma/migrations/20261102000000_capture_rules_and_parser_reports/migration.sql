-- AlterTable
ALTER TABLE "sender_rules" ADD COLUMN     "ignore" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "to_account_id" UUID;

-- CreateTable
CREATE TABLE "parser_reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "capture_id" UUID,
    "sender" TEXT NOT NULL,
    "institution" TEXT,
    "text" TEXT NOT NULL,
    "parser_version" INTEGER,
    "template_id" TEXT,
    "parsed" JSONB NOT NULL,
    "corrected" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parser_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parser_reports_capture_id_key" ON "parser_reports"("capture_id");

-- CreateIndex
CREATE INDEX "parser_reports_created_at_idx" ON "parser_reports"("created_at");

-- AddForeignKey
ALTER TABLE "sender_rules" ADD CONSTRAINT "sender_rules_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "money_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parser_reports" ADD CONSTRAINT "parser_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parser_reports" ADD CONSTRAINT "parser_reports_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captured_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;