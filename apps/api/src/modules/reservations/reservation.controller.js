import { asyncHandler } from '../../lib/asyncHandler.js';
import { resolveRestaurant } from '../restaurants/restaurant.service.js';
import { getDayAvailability } from './availability.service.js';
import { bookingRules, cancelReservation, createReservation } from './booking.service.js';
import * as reservationService from './reservation.service.js';

export const getAvailability = asyncHandler(async (req, res) => {
  const { date, partySize, restaurant: restaurantSlug } = req.query;
  const venue = await resolveRestaurant({ restaurantSlug });
  res.json(await getDayAvailability(venue.id, date, partySize));
});

export const getRules = asyncHandler(async (_req, res) => {
  res.json(bookingRules());
});

export const create = asyncHandler(async (req, res) => {
  // optionalAuth means req.user is present for signed-in guests and absent
  // for walk-up bookings — both are valid.
  const venue = await resolveRestaurant({ restaurantSlug: req.body.restaurantSlug });
  const reservation = await createReservation(
    { ...req.body, restaurantId: venue.id },
    req.user ?? null,
    'WEB',
  );
  res.status(201).json({
    reservation: reservationService.toPublicReservation(reservation),
    message: `Table booked. Your reference is ${reservation.reference}.`,
  });
});

export const listMine = asyncHandler(async (req, res) => {
  let restaurantId;
  if (req.query.restaurant) {
    const venue = await resolveRestaurant({ restaurantSlug: req.query.restaurant });
    restaurantId = venue.id;
  }
  res.json(await reservationService.listForUser(req.user.id, { ...req.query, restaurantId }));
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ reservation: await reservationService.getById(req.params.id, req.user ?? null) });
});

export const lookup = asyncHandler(async (req, res) => {
  const { reference, phone } = req.body;
  res.json({ reservation: await reservationService.findByReference(reference, phone) });
});

export const cancel = asyncHandler(async (req, res) => {
  const reservation = await cancelReservation(req.params.id, req.user ?? null);
  res.json({
    reservation: reservationService.toPublicReservation(reservation),
    message: 'Your reservation has been cancelled.',
  });
});
