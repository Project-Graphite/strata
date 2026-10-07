CREATE TABLE "journal_entries" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "note_id" UUID,
    "mood" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("user_id","day")
);

CREATE INDEX "journal_entries_note_id_idx" ON "journal_entries"("note_id");

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
