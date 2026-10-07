CREATE TABLE "event_poll_options" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "start_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_poll_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_poll_votes" (
    "id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "user_id" UUID,
    "guest_id" UUID,
    "answer" "GuestResponse" NOT NULL,
    CONSTRAINT "event_poll_votes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_poll_votes_one_voter" CHECK (num_nonnulls("user_id", "guest_id") = 1),
    CONSTRAINT "event_poll_votes_answered" CHECK ("answer" <> 'pending')
);

CREATE INDEX "event_poll_options_item_id_idx" ON "event_poll_options"("item_id");

CREATE INDEX "event_poll_votes_guest_id_idx" ON "event_poll_votes"("guest_id");

CREATE INDEX "event_poll_votes_user_id_idx" ON "event_poll_votes"("user_id");

CREATE UNIQUE INDEX "event_poll_votes_option_id_user_id_key" ON "event_poll_votes"("option_id", "user_id");

CREATE UNIQUE INDEX "event_poll_votes_option_id_guest_id_key" ON "event_poll_votes"("option_id", "guest_id");

ALTER TABLE "event_poll_options" ADD CONSTRAINT "event_poll_options_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_poll_votes" ADD CONSTRAINT "event_poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "event_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_poll_votes" ADD CONSTRAINT "event_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_poll_votes" ADD CONSTRAINT "event_poll_votes_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "event_guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
