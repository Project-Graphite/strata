-- Comment reactions and profile pictures
ALTER TABLE "users" ADD COLUMN     "avatar_id" UUID;

CREATE TABLE "comment_reactions" (
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("comment_id","user_id","emoji")
);

CREATE INDEX "comment_reactions_user_id_idx" ON "comment_reactions"("user_id");

CREATE UNIQUE INDEX "users_avatar_id_key" ON "users"("avatar_id");

ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_fkey" FOREIGN KEY ("avatar_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "note_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;