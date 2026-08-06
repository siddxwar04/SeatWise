import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ApiError, DEFAULT_RESTAURANT_SLUG, reservationApi } from '../lib/api.js';

/**
 * The booking form.
 *
 * The legacy version (index.html:192-208) posted to reservation.php with:
 *   - placeholder-only inputs and no <label> at all (audit #28) — the date,
 *     time and people fields had no accessible name whatsoever
 *   - a <select> whose values were "2 People" and "5+ People" (audit #18),
 *     which is why capacity arithmetic was impossible
 *   - no min on the date input, so past dates submitted happily (audit #19)
 *   - no in-flight state, so double-clicking created two bookings (audit #30)
 *   - an alert() and a full page navigation on both success and failure, which
 *     threw away everything typed on error (audit #27)
 *
 * All of that is addressed here. The wrapper markup and class names are
 * unchanged, so the section still looks identical.
 */

/** Today in the restaurant's timezone — the floor for the date picker. */
function todayInputValue(utcOffsetMinutes = 330) {
  const now = new Date();
  const local = new Date(now.getTime() + (utcOffsetMinutes + now.getTimezoneOffset()) * 60_000);
  return local.toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  guestName: '',
  guestPhone: '',
  date: '',
  time: '',
  partySize: 2,
  specialRequests: '',
};

export function ReservationSection() {
  const { user } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [maxPartySize, setMaxPartySize] = useState(10);
  const [utcOffsetMinutes, setUtcOffsetMinutes] = useState(330);

  const minDate = todayInputValue(utcOffsetMinutes);

  // Prefill for signed-in guests — they should not retype what we already know.
  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        guestName: f.guestName || user.username,
        guestPhone: f.guestPhone || (user.phone ?? ''),
      }));
    }
  }, [user]);

  // Party-size options and timezone come from the server's rules, so the form
  // can never drift from what the booking engine will accept.
  useEffect(() => {
    reservationApi
      .rules()
      .then((rules) => {
        if (typeof rules.maxPartySize === 'number') setMaxPartySize(rules.maxPartySize);
        if (typeof rules.utcOffsetMinutes === 'number') setUtcOffsetMinutes(rules.utcOffsetMinutes);
      })
      .catch(() => {
        toast.error('Could not load booking rules. Using defaults — the server still validates.');
      });
    // toast is stable enough; avoid re-fetch loops if context identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Live availability. Every date/party-size change asks the server which
   * slots can actually take this booking, so the time field only ever offers
   * real options. This is the honesty the old free-text time input lacked.
   */
  useEffect(() => {
    if (!form.date) {
      setSlots([]);
      setSlotsError(null);
      return undefined;
    }

    let cancelled = false;
    setLoadingSlots(true);
    setSlotsError(null);

    reservationApi
      .availability(DEFAULT_RESTAURANT_SLUG, form.date, form.partySize)
      .then((data) => {
        if (cancelled) return;
        setSlots(data.slots);
        setSlotsError(null);
        // If the chosen time just became unavailable, clear it rather than
        // letting the user submit something we already know will fail.
        setForm((f) => {
          const stillOpen = data.slots.some((s) => s.time === f.time && s.available);
          return stillOpen ? f : { ...f, time: '' };
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setSlots([]);
        setSlotsError(
          err instanceof ApiError
            ? err.message
            : 'Could not check availability. Please try another date or refresh.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.date, form.partySize]);

  const update = (field) => (event) => {
    const raw = event.target.value;
    const value = field === 'partySize' ? Number(raw) : raw;
    setForm((f) => ({ ...f, [field]: value }));
    // Clear the error as soon as the field is touched — leaving it up while
    // someone is fixing it reads as though the fix did not register.
    setFieldErrors((errors) => {
      if (!errors[field]) return errors;
      const next = { ...errors };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFieldErrors({});

    try {
      const payload = {
        restaurantSlug: DEFAULT_RESTAURANT_SLUG,
        guestName: form.guestName,
        guestPhone: form.guestPhone,
        partySize: form.partySize,
        date: form.date,
        time: form.time,
        ...(form.specialRequests ? { specialRequests: form.specialRequests } : {}),
        ...(user?.email ? { guestEmail: user.email } : {}),
      };

      const result = await reservationApi.create(payload);
      setConfirmation(result.reservation);
      toast.success(result.message);
      setForm({ ...EMPTY_FORM, guestName: user?.username ?? '', guestPhone: user?.phone ?? '' });
    } catch (err) {
      if (err instanceof ApiError) {
        // Field-level messages land under the inputs; everything else is a
        // toast. Either way the form keeps what was typed.
        if (err.details && typeof err.details === 'object') {
          setFieldErrors(err.details);
          toast.error('Please check the highlighted fields.');
        } else {
          toast.error(err.message);
        }
        // A 409 means the slot went while they were filling the form; refresh
        // the grid so they can see what is left.
        if (err.status === 409 && form.date) {
          reservationApi
            .availability(DEFAULT_RESTAURANT_SLUG, form.date, form.partySize)
            .then((data) => {
              setSlots(data.slots);
              setSlotsError(null);
            })
            .catch(() => {
              setSlotsError('Could not refresh availability after the conflict.');
            });
        }
      } else {
        toast.error('Could not reach the server. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const partyOptions = Array.from({ length: maxPartySize }, (_, i) => i + 1);

  let timeHint = 'Availability updates as you choose a date and party size.';
  if (slotsError) {
    timeHint = slotsError;
  } else if (form.date && !loadingSlots && slots.length > 0) {
    timeHint = `${slots.filter((s) => s.available).length} of ${slots.length} sittings available for ${form.partySize} ${form.partySize === 1 ? 'guest' : 'guests'}.`;
  } else if (form.date && !loadingSlots && slots.length === 0) {
    timeHint = 'No sittings available for that date and party size. Try another day.';
  }

  return (
    <section className="reservation_section" id="reserve">
      <div className="container reservation_container">
        <div className="reservation_form_wrapper">
          <span className="tag">Book A Table</span>
          <h2>Dining with us?</h2>
          <p>
            Reserve your spot for an unforgettable evening. We recommend booking at least 24 hours
            in advance.
          </p>

          {confirmation ? (
            <div className="booking_confirmation" role="status">
              <h3>You&apos;re booked.</h3>
              <p className="booking_reference">{confirmation.reference}</p>
              <dl className="booking_summary">
                <div>
                  <dt>When</dt>
                  <dd>
                    {confirmation.date} at {confirmation.time}
                  </dd>
                </div>
                <div>
                  <dt>Party</dt>
                  <dd>
                    {confirmation.partySize} {confirmation.partySize === 1 ? 'guest' : 'guests'}
                  </dd>
                </div>
                {confirmation.table && (
                  <div>
                    <dt>Table</dt>
                    <dd>
                      {confirmation.table.label} ({confirmation.table.zone.toLowerCase()})
                    </dd>
                  </div>
                )}
              </dl>
              <p className="booking_hint">
                Keep your reference handy. Signed-in guests can manage bookings under My Bookings;
                otherwise bring this reference when you arrive.
              </p>
              <button type="button" className="btn btn-login" onClick={() => setConfirmation(null)}>
                Book another table
              </button>
            </div>
          ) : (
            <form className="reservation_form" onSubmit={handleSubmit} noValidate>
              <div className="input_row">
                <div className="field">
                  <label htmlFor="guestName">Your Name</label>
                  <input
                    id="guestName"
                    type="text"
                    name="guestName"
                    value={form.guestName}
                    onChange={update('guestName')}
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.guestName)}
                    aria-describedby={fieldErrors.guestName ? 'guestName-error' : undefined}
                    required
                  />
                  {fieldErrors.guestName && (
                    <p className="field_error" id="guestName-error">
                      {fieldErrors.guestName}
                    </p>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="guestPhone">Phone Number</label>
                  <input
                    id="guestPhone"
                    type="tel"
                    name="guestPhone"
                    value={form.guestPhone}
                    onChange={update('guestPhone')}
                    autoComplete="tel"
                    inputMode="numeric"
                    placeholder="10-digit mobile"
                    aria-invalid={Boolean(fieldErrors.guestPhone)}
                    aria-describedby={fieldErrors.guestPhone ? 'guestPhone-error' : undefined}
                    required
                  />
                  {fieldErrors.guestPhone && (
                    <p className="field_error" id="guestPhone-error">
                      {fieldErrors.guestPhone}
                    </p>
                  )}
                </div>
              </div>

              <div className="input_row">
                <div className="field">
                  <label htmlFor="date">Date</label>
                  {/* min stops past dates at the picker; the server enforces it
                      again, because a min attribute is a two-second DevTools edit. */}
                  <input
                    id="date"
                    type="date"
                    name="date"
                    value={form.date}
                    min={minDate}
                    onChange={update('date')}
                    aria-invalid={Boolean(fieldErrors.date)}
                    required
                  />
                  {fieldErrors.date && <p className="field_error">{fieldErrors.date}</p>}
                </div>

                <div className="field">
                  <label htmlFor="partySize">Guests</label>
                  <select
                    id="partySize"
                    name="partySize"
                    value={form.partySize}
                    onChange={update('partySize')}
                    required
                  >
                    {partyOptions.map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'Person' : 'People'}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.partySize && <p className="field_error">{fieldErrors.partySize}</p>}
                </div>

                <div className="field">
                  <label htmlFor="time">Time</label>
                  <select
                    id="time"
                    name="time"
                    value={form.time}
                    onChange={update('time')}
                    disabled={!form.date || loadingSlots || Boolean(slotsError)}
                    aria-invalid={Boolean(fieldErrors.time) || Boolean(slotsError)}
                    aria-describedby="time-hint"
                    required
                  >
                    <option value="">
                      {!form.date
                        ? 'Pick a date first'
                        : loadingSlots
                          ? 'Checking availability…'
                          : slotsError
                            ? 'Availability unavailable'
                            : 'Select a time'}
                    </option>
                    {slots.map((slot) => (
                      <option key={slot.time} value={slot.time} disabled={!slot.available}>
                        {slot.time}
                        {slot.available
                          ? slot.tablesFree <= 2
                            ? ` — only ${slot.tablesFree} left`
                            : ''
                          : ' — unavailable'}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.time && <p className="field_error">{fieldErrors.time}</p>}
                </div>
              </div>

              <p
                id="time-hint"
                className={slotsError ? 'field_hint field_hint_error' : 'field_hint'}
                role={slotsError ? 'alert' : undefined}
              >
                {timeHint}
              </p>

              <div className="field">
                <label htmlFor="specialRequests">
                  Anything we should know? <span className="field_optional">(optional)</span>
                </label>
                <input
                  id="specialRequests"
                  type="text"
                  name="specialRequests"
                  value={form.specialRequests}
                  onChange={update('specialRequests')}
                  maxLength={500}
                  placeholder="Allergies, high chair, window seat…"
                />
              </div>

              {/* disabled while in flight — the old form had no in-flight state
                  at all, so an impatient double-click made two reservations. */}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={submitting || Boolean(slotsError)}
              >
                {submitting ? 'Booking your table…' : 'Confirm Booking'}
              </button>
            </form>
          )}
        </div>
        <div className="reservation_image">
          <img
            src="/images/reservation.webp"
            alt="Waitress Serving"
            loading="lazy"
            width="600"
            height="700"
          />
        </div>
      </div>
    </section>
  );
}
