-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'CONVERTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID,
    "guest_name" VARCHAR(80) NOT NULL,
    "guest_phone" VARCHAR(20) NOT NULL,
    "guest_email" TEXT,
    "requested_date" DATE NOT NULL,
    "requested_time" VARCHAR(5) NOT NULL,
    "party_size" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "notified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "waitlist_entries_restaurant_id_status_requested_date_idx"
  ON "waitlist_entries"("restaurant_id", "status", "requested_date");

CREATE INDEX "waitlist_entries_user_id_idx" ON "waitlist_entries"("user_id");

ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
