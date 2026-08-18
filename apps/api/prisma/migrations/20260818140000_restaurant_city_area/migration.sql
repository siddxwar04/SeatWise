-- SeatWise gap 1/7: city/geo on Restaurant.
--
-- The frontend's multi-city Discover page filters by a city slug + neighbourhood
-- area (see apps/web/src/data/cities.js), but `address` is free text and cannot
-- be filtered on reliably. Defaults below match the three existing seeded
-- restaurants (all Bengaluru); `npm run db:seed` corrects every row's real
-- city/area on the next run, and backfills five more venues across the
-- remaining five cities.

ALTER TABLE "restaurants"
  ADD COLUMN "city" VARCHAR(40) NOT NULL DEFAULT 'bengaluru',
  ADD COLUMN "area" VARCHAR(80) NOT NULL DEFAULT 'Koramangala';

CREATE INDEX "restaurants_city_idx" ON "restaurants"("city");
