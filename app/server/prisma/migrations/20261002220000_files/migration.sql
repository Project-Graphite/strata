ALTER TABLE "site_settings" ADD COLUMN "file_quota_mb" INTEGER NOT NULL DEFAULT 100;

CREATE TABLE "file_blobs" (
    "sha256" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_blobs_pkey" PRIMARY KEY ("sha256")
);

CREATE TABLE "files" (
    "item_id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "files_pkey" PRIMARY KEY ("item_id")
);

CREATE INDEX "files_sha256_idx" ON "files"("sha256");

CREATE INDEX "files_uploaded_by_idx" ON "files"("uploaded_by");

ALTER TABLE "files" ADD CONSTRAINT "files_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "files" ADD CONSTRAINT "files_sha256_fkey" FOREIGN KEY ("sha256") REFERENCES "file_blobs"("sha256") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
