-- SeatWise gap 4/7: marketing/discovery fields on Restaurant.
-- priceLevel/cuisine/vibeTags already existed (added in the risk/overbooking
-- migration) — this adds the rest: tagline/about/signatures copy, the
-- curated-lane badge, and booking-mechanics fields (type/walk-in/prepaid/policy)
-- the frontend's venue fixtures already assume.

CREATE TYPE "BookingType" AS ENUM ('TABLE', 'COUNTER', 'EXPERIENCE', 'WAITLIST');

ALTER TABLE "restaurants"
  ADD COLUMN "tagline" VARCHAR(200),
  ADD COLUMN "about" VARCHAR(1000),
  ADD COLUMN "signatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "curated" VARCHAR(40),
  ADD COLUMN "booking_type" "BookingType" NOT NULL DEFAULT 'TABLE',
  ADD COLUMN "walk_in" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "prepaid_paise" INTEGER,
  ADD COLUMN "policy" VARCHAR(500);
