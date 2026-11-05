-- Each epic remembers whether its tasks show as a list or a board
CREATE TABLE "task_list_views" (
    "item_id" UUID NOT NULL,
    "view" TEXT NOT NULL,

    CONSTRAINT "task_list_views_pkey" PRIMARY KEY ("item_id")
);

ALTER TABLE "task_list_views" ADD CONSTRAINT "task_list_views_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;