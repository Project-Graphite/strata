-- Share link names and links that never expire

ALTER TABLE "share_links" ADD COLUMN "slug" TEXT, ALTER COLUMN "expires_at" DROP NOT NULL;
CREATE UNIQUE INDEX "share_links_slug_key" ON "share_links"("slug");
