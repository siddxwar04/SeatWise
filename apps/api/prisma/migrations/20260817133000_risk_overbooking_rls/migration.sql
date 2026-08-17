-- SeatWise differentiators on the TastyFood schema:
--   1. restaurant_id on reservations (RLS + overbooked rows with no table)
--   2. combinable tables for waitlist bin-packing
--   3. cuisine / price / vibe filters for diner search + concierge grounding
--   4. Postgres RLS policies as defence in depth
--
-- RLS note: policies are ENABLE'd, not FORCE'd. The DATABASE_URL role is the
-- table owner in local/Neon setups, and owners bypass RLS unless FORCE is on.
-- Production should connect as a non-owner role (or ENABLE FORCE ROW LEVEL
-- SECURITY) so a missed application filter returns zero rows instead of
-- another tenant's bookings. Application code still SET LOCAL
-- app.current_restaurant_id in every tenant-scoped transaction so that switch
-- is a config change, not a rewrite.

-- Restaurant catalogue fields ------------------------------------------------

ALTER TABLE "restaurants"
  ADD COLUMN "cuisine" VARCHAR(80) NOT NULL DEFAULT 'Indian',
  ADD COLUMN "price_level" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "vibe_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "restaurants_cuisine_idx" ON "restaurants"("cuisine");

-- Combinable tables ----------------------------------------------------------

ALTER TABLE "restaurant_tables"
  ADD COLUMN "combinable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "combine_group" VARCHAR(16);

-- Tenant key on reservations -------------------------------------------------

ALTER TABLE "reservations"
  ADD COLUMN "restaurant_id" UUID,
  ADD COLUMN "lead_time_hours" DOUBLE PRECISION;

UPDATE "reservations" r
SET "restaurant_id" = t."restaurant_id"
FROM "restaurant_tables" t
WHERE r."table_id" = t."id"
  AND r."restaurant_id" IS NULL;

-- Any leftover row without a table (should not exist yet) cannot be tenant-
-- scoped; drop it rather than invent a restaurant.
DELETE FROM "reservations" WHERE "restaurant_id" IS NULL;

ALTER TABLE "reservations"
  ALTER COLUMN "restaurant_id" SET NOT NULL;

CREATE INDEX "reservations_restaurant_id_service_date_status_idx"
  ON "reservations"("restaurant_id", "service_date", "status");

CREATE INDEX "reservations_restaurant_id_starts_at_ends_at_idx"
  ON "reservations"("restaurant_id", "starts_at", "ends_at");

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security ---------------------------------------------------------

ALTER TABLE "reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "waitlist_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_items" ENABLE ROW LEVEL SECURITY;

-- Missing GUC → policy does not match → no rows for a non-owner role.
-- `true` as the second arg of current_setting means "missing is NULL, not error".

CREATE POLICY reservations_tenant_isolation ON "reservations"
  USING (
    "restaurant_id" = NULLIF(current_setting('app.current_restaurant_id', true), '')::uuid
  )
  WITH CHECK (
    "restaurant_id" = NULLIF(current_setting('app.current_restaurant_id', true), '')::uuid
  );

CREATE POLICY restaurant_tables_tenant_isolation ON "restaurant_tables"
  USING (
    "restaurant_id" = NULLIF(current_setting('app.current_restaurant_id', true), '')::uuid
  )
  WITH CHECK (
    "restaurant_id" = NULLIF(current_setting('app.current_restaurant_id', true), '')::uuid
  );

CREATE POLICY waitlist_entries_tenant_isolation ON "waitlist_entries"
  USING (
    "restaurant_id" = NULLIF(current_setting('app.current_restaurant_id', true), '')::uuid
  )
  WITH CHECK (
    "restaurant_id" = NULLIF(current_setting('app.current_restaurant_id', true), '')::uuid
  );

CREATE POLICY menu_items_tenant_isolation ON "menu_items"
  USING (
    "restaurant_id" = NULLIF(current_setting('app.current_restaurant_id', true), '')::uuid
  )
  WITH CHECK (
    "restaurant_id" = NULLIF(current_setting('app.current_restaurant_id', true), '')::uuid
  );
