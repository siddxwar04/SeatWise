-- SeatWise gap 3/7: ratings/reviews did not exist at all.
--
-- One review per reservation (unique reservation_id), so a review always
-- answers "which visit was this" and a visit cannot be reviewed twice.
-- rating_avg/rating_count on restaurants are denormalised — recomputed from
-- real rows inside a transaction in reviews.service.js whenever a review is
-- created, never hand-incremented (see the field comment in schema.prisma).

ALTER TABLE "restaurants"
  ADD COLUMN "rating_avg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "reviews" (
  "id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "user_id" UUID,
  "author_name" VARCHAR(80) NOT NULL,
  "stars" INTEGER NOT NULL,
  "body" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
  -- Defence in depth alongside the Zod z.number().int().min(1).max(5) check —
  -- a stray raw INSERT (a future admin script, a bad migration) still cannot
  -- put a 9-star review in front of a diner.
  CONSTRAINT "reviews_stars_range" CHECK ("stars" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "reviews_reservation_id_key" ON "reviews"("reservation_id");
CREATE INDEX "reviews_restaurant_id_created_at_idx" ON "reviews"("restaurant_id", "created_at");

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
