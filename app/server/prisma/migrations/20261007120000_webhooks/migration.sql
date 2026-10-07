CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "space_id" UUID,
    "url_sealed" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "secret_sealed" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cursor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhook_id" UUID NOT NULL,
    "activity_id" UUID,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" INTEGER,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhooks_user_id_idx" ON "webhooks"("user_id");

CREATE INDEX "webhooks_active_idx" ON "webhooks"("active");

CREATE INDEX "webhook_deliveries_webhook_id_created_at_idx" ON "webhook_deliveries"("webhook_id", "created_at");

CREATE INDEX "webhook_deliveries_created_at_idx" ON "webhook_deliveries"("created_at");

CREATE UNIQUE INDEX "webhook_deliveries_webhook_id_activity_id_key" ON "webhook_deliveries"("webhook_id", "activity_id");

ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
