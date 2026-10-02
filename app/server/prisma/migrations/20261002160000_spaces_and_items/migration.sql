CREATE TYPE "SpaceRole" AS ENUM ('owner', 'editor', 'viewer');

CREATE TYPE "ItemKind" AS ENUM ('note', 'task', 'event', 'subscription', 'board', 'file');

CREATE TYPE "LinkKind" AS ENUM ('mention', 'reference', 'attachment');

CREATE TABLE "spaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "personal_owner_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "space_members" (
    "space_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "SpaceRole" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "space_members_pkey" PRIMARY KEY ("space_id", "user_id")
);

CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "kind" "ItemKind" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "created_by" UUID,
    "updated_by" UUID,
    "archived_at" TIMESTAMP(3),
    "trashed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "item_tags" (
    "item_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    CONSTRAINT "item_tags_pkey" PRIMARY KEY ("item_id", "tag_id")
);

CREATE TABLE "item_links" (
    "id" UUID NOT NULL,
    "source_item_id" UUID NOT NULL,
    "target_item_id" UUID NOT NULL,
    "kind" "LinkKind" NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "item_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "spaces_personal_owner_id_key" ON "spaces"("personal_owner_id");

CREATE INDEX "space_members_user_id_idx" ON "space_members"("user_id");

CREATE INDEX "items_space_id_updated_at_idx" ON "items"("space_id", "updated_at");

CREATE UNIQUE INDEX "tags_space_id_lower_name_key" ON "tags"("space_id", lower("name"));

CREATE INDEX "item_tags_tag_id_idx" ON "item_tags"("tag_id");

CREATE INDEX "item_links_target_item_id_idx" ON "item_links"("target_item_id");

CREATE UNIQUE INDEX "item_links_source_item_id_target_item_id_kind_key" ON "item_links"("source_item_id", "target_item_id", "kind");

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_personal_owner_id_fkey" FOREIGN KEY ("personal_owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "items" ADD CONSTRAINT "items_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "items" ADD CONSTRAINT "items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "items" ADD CONSTRAINT "items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tags" ADD CONSTRAINT "tags_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "item_links" ADD CONSTRAINT "item_links_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "item_links" ADD CONSTRAINT "item_links_target_item_id_fkey" FOREIGN KEY ("target_item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "item_links" ADD CONSTRAINT "item_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "spaces" ("id", "name", "personal_owner_id", "created_by", "updated_at")
SELECT gen_random_uuid(), 'Personal', "id", "id", CURRENT_TIMESTAMP FROM "users";

INSERT INTO "space_members" ("space_id", "user_id", "role")
SELECT "id", "personal_owner_id", 'owner' FROM "spaces" WHERE "personal_owner_id" IS NOT NULL;
