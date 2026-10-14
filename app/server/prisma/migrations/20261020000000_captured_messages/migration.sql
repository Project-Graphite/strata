-- CreateTable
CREATE TABLE "captured_messages" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sender" TEXT NOT NULL,
    "text_sealed" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'review',
    "suggestion" JSONB NOT NULL DEFAULT '{}',
    "expense_id" UUID,
    "received_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "captured_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "captured_messages_space_id_status_idx" ON "captured_messages"("space_id", "status");

-- CreateIndex
CREATE INDEX "captured_messages_created_at_idx" ON "captured_messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "captured_messages_space_id_hash_key" ON "captured_messages"("space_id", "hash");

-- AddForeignKey
ALTER TABLE "captured_messages" ADD CONSTRAINT "captured_messages_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captured_messages" ADD CONSTRAINT "captured_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captured_messages" ADD CONSTRAINT "captured_messages_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

