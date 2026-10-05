CREATE TABLE "database_schemas" (
    "item_id" UUID NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '[]',
    "view" TEXT NOT NULL DEFAULT 'table',
    "group_by" TEXT,
    "date_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "database_schemas_pkey" PRIMARY KEY ("item_id")
);

CREATE TABLE "note_properties" (
    "item_id" UUID NOT NULL,
    "property_id" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    CONSTRAINT "note_properties_pkey" PRIMARY KEY ("item_id","property_id")
);

ALTER TABLE "database_schemas" ADD CONSTRAINT "database_schemas_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_properties" ADD CONSTRAINT "note_properties_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
