CREATE TYPE "InvitationKind" AS ENUM ('app', 'space');

CREATE TYPE "ShareAccess" AS ENUM ('view', 'edit');

CREATE TABLE "site_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "invite_only" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "kind" "InvitationKind" NOT NULL,
    "space_id" UUID,
    "role" "SpaceRole",
    "email" TEXT,
    "invitee_id" UUID,
    "token_hash" TEXT NOT NULL,
    "inviter_id" UUID,
    "note" TEXT,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitation_redemptions" (
    "invitation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invitation_redemptions_pkey" PRIMARY KEY ("invitation_id", "user_id")
);

CREATE TABLE "share_links" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "access" "ShareAccess" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

CREATE INDEX "invitations_space_id_idx" ON "invitations"("space_id");

CREATE INDEX "invitations_email_idx" ON "invitations"("email");

CREATE INDEX "invitations_invitee_id_idx" ON "invitations"("invitee_id");

CREATE INDEX "invitations_inviter_id_idx" ON "invitations"("inviter_id");

CREATE INDEX "invitation_redemptions_user_id_idx" ON "invitation_redemptions"("user_id");

CREATE UNIQUE INDEX "share_links_token_hash_key" ON "share_links"("token_hash");

CREATE INDEX "share_links_item_id_idx" ON "share_links"("item_id");

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invitation_redemptions" ADD CONSTRAINT "invitation_redemptions_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitation_redemptions" ADD CONSTRAINT "invitation_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "share_links" ADD CONSTRAINT "share_links_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
