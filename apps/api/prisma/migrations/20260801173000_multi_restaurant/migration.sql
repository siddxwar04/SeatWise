-- DropIndex
DROP INDEX "restaurant_tables_label_key";

-- DropIndex
DROP INDEX "restaurant_tables_capacity_is_active_idx";

-- DropIndex
DROP INDEX "menu_items_slug_key";

-- DropIndex
DROP INDEX "menu_items_category_is_available_idx";

-- AlterTable
ALTER TABLE "restaurant_tables" ADD COLUMN     "restaurant_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "restaurant_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "restaurants" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_admins" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE INDEX "restaurants_is_active_idx" ON "restaurants"("is_active");

-- CreateIndex
CREATE INDEX "restaurant_admins_user_id_idx" ON "restaurant_admins"("user_id");

-- CreateIndex
CREATE INDEX "restaurant_admins_restaurant_id_idx" ON "restaurant_admins"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_admins_user_id_restaurant_id_key" ON "restaurant_admins"("user_id", "restaurant_id");

-- CreateIndex
CREATE INDEX "restaurant_tables_restaurant_id_idx" ON "restaurant_tables"("restaurant_id");

-- CreateIndex
CREATE INDEX "restaurant_tables_restaurant_id_capacity_is_active_idx" ON "restaurant_tables"("restaurant_id", "capacity", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_restaurant_id_label_key" ON "restaurant_tables"("restaurant_id", "label");

-- CreateIndex
CREATE INDEX "menu_items_restaurant_id_idx" ON "menu_items"("restaurant_id");

-- CreateIndex
CREATE INDEX "menu_items_restaurant_id_category_is_available_idx" ON "menu_items"("restaurant_id", "category", "is_available");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_restaurant_id_slug_key" ON "menu_items"("restaurant_id", "slug");

-- AddForeignKey
ALTER TABLE "restaurant_admins" ADD CONSTRAINT "restaurant_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_admins" ADD CONSTRAINT "restaurant_admins_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
