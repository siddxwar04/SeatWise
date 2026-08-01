-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "MenuCategory" AS ENUM ('BREAKFAST', 'LUNCH', 'DESSERT');

-- CreateEnum
CREATE TYPE "Allergen" AS ENUM ('GLUTEN', 'DAIRY', 'EGG', 'PEANUT', 'TREE_NUT', 'SOY', 'FISH', 'SHELLFISH', 'SESAME');

-- CreateEnum
CREATE TYPE "DietaryTag" AS ENUM ('VEGETARIAN', 'VEGAN', 'JAIN', 'HALAL', 'CONTAINS_EGG', 'NON_VEGETARIAN', 'SPICY');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingChannel" AS ENUM ('WEB', 'AI_ASSISTANT', 'PHONE', 'WALK_IN');

-- CreateEnum
CREATE TYPE "TableZone" AS ENUM ('INDOOR', 'OUTDOOR', 'PRIVATE', 'BAR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" VARCHAR(60) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone" VARCHAR(20),
    "role" "Role" NOT NULL DEFAULT 'USER',
    "prior_bookings" INTEGER NOT NULL DEFAULT 0,
    "prior_no_shows" INTEGER NOT NULL DEFAULT 0,
    "email_verified_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" VARCHAR(255),
    "ip_address" VARCHAR(45),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_tables" (
    "id" UUID NOT NULL,
    "label" VARCHAR(16) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "zone" "TableZone" NOT NULL DEFAULT 'INDOOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(12) NOT NULL,
    "user_id" UUID,
    "guest_name" VARCHAR(80) NOT NULL,
    "guest_phone" VARCHAR(20) NOT NULL,
    "guest_email" TEXT,
    "party_size" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "service_date" DATE NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "BookingChannel" NOT NULL DEFAULT 'WEB',
    "table_id" UUID,
    "special_requests" VARCHAR(500),
    "no_show_risk" DOUBLE PRECISION,
    "risk_model_version" VARCHAR(32),
    "is_overbooked" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "seated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(600) NOT NULL,
    "price_in_paise" INTEGER NOT NULL,
    "category" "MenuCategory" NOT NULL,
    "image_url" VARCHAR(255) NOT NULL,
    "image_alt" VARCHAR(160) NOT NULL,
    "allergens" "Allergen"[],
    "dietary_tags" "DietaryTag"[],
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_label_key" ON "restaurant_tables"("label");

-- CreateIndex
CREATE INDEX "restaurant_tables_capacity_is_active_idx" ON "restaurant_tables"("capacity", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_reference_key" ON "reservations"("reference");

-- CreateIndex
CREATE INDEX "reservations_service_date_status_idx" ON "reservations"("service_date", "status");

-- CreateIndex
CREATE INDEX "reservations_table_id_starts_at_ends_at_idx" ON "reservations"("table_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "reservations_user_id_starts_at_idx" ON "reservations"("user_id", "starts_at");

-- CreateIndex
CREATE INDEX "reservations_reference_idx" ON "reservations"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_slug_key" ON "menu_items"("slug");

-- CreateIndex
CREATE INDEX "menu_items_category_is_available_idx" ON "menu_items"("category", "is_available");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Double-booking backstop (application code also uses SELECT ... FOR UPDATE).
-- Even if the service layer is wrong, Postgres refuses overlapping active
-- bookings on the same table. half-open [starts_at, ends_at).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_no_overlapping_active"
  EXCLUDE USING gist (
    "table_id" WITH =,
    tsrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE (
    "table_id" IS NOT NULL
    AND "status" IN ('PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED')
  );
