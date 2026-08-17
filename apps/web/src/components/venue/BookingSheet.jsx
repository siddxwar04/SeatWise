import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ZONES } from '../../data/cities.js';
import { formatDateLong, formatTime, rupees } from '../../lib/format.js';
import { useCountdown } from '../../lib/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ApiError } from '../../lib/api.js';
import { createBooking } from '../../services/marketplace.js';
import { ServiceError } from '../../services/config.js';
import { Button } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Field, Segmented, Stepper, TextArea, TextField } from '../ui/Field.jsx';
import { Sheet } from '../ui/Overlay.jsx';

/**
 * The booking flow.
 *
 * A five-minute hold on the chosen slot (`useCountdown`) is the honest version
 * of the urgency banners competitors fake — this one actually expires and
 * actually means something, because it maps to the real 5-minute hold the
 * reservations API takes on a table once a request comes in.
 */
export function BookingSheet({ venue, date, open, initialTime, onClose }) {
  const [time, setTime] = useState(initialTime);
  const [party, setParty] = useState(2);
  const [zone, setZone] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const toast = useToast();
  const navigate = useNavigate();

  const secondsLeft = useCountdown(venue.policy.holdMinutes * 60, open && !done);
  const expired = secondsLeft <= 0;

  const availableZones = useMemo(
    () => [...new Set(venue.tables.map((t) => t.zone))],
    [venue.tables],
  );

  const submit = async (event) => {
    event.preventDefault();
    if (submitting || expired) return;

    setSubmitting(true);
    setErrors({});

    try {
      const booking = await createBooking({
        venueSlug: venue.slug,
        date,
        time,
        partySize: party,
        zone,
        guest: { name, phone },
        note: note.trim() || null,
      });
      setDone(booking);
    } catch (err) {
      if (err instanceof ServiceError || err instanceof ApiError) {
        if (err.details) setErrors(err.details);
        toast.error(err.message);
      } else {
        toast.error('Could not complete the booking. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    onClose();
    setDone(null);
  };

  if (done) {
    return (
      <Sheet open={open} onClose={close} title="You're booked">
        <div className="booked">
          <span className="booked_icon">
            <Icon name="calendar-check" />
          </span>
          <h3>{venue.name}</h3>
          <p>
            {formatDateLong(date)} at {formatTime(time)} · {party} guest{party === 1 ? '' : 's'}
          </p>
          <p className="booked_ref mono">{done.reference}</p>
          <p className="booked_status">
            {done.status === 'CONFIRMED'
              ? 'Confirmed — the venue is expecting you.'
              : 'Sent to the venue for confirmation. You will hear back shortly.'}
          </p>
          <div className="booked_actions">
            <Button variant="primary" onClick={() => navigate(`/bookings/${done.reference}`)}>
              View booking
            </Button>
            <Button variant="secondary" onClick={close}>
              Keep browsing
            </Button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={`Book ${venue.name}`}
      subtitle={`${formatDateLong(date)} · held for ${expired ? '0:00' : formatCountdownLabel(secondsLeft)}`}
      footer={
        <>
          <Button variant="secondary" block onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" block type="submit" form="booking-form" loading={submitting} disabled={expired}>
            {expired ? 'Hold expired' : 'Confirm booking'}
          </Button>
        </>
      }
    >
      {expired && (
        <p className="note note-warn">
          <Icon name="alert" />
          Your hold on {formatTime(time)} expired. Close this and pick a time again — the table may
          still be free.
        </p>
      )}

      <form id="booking-form" className="stack" onSubmit={submit}>
        <div className="booking_grid">
          <Field label="Time">
            {() => (
              <select className="input select" value={time} onChange={(e) => setTime(e.target.value)}>
                {venue.slots.map((s) => (
                  <option key={s.time} value={s.time}>
                    {formatTime(s.time)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Guests">{() => <Stepper value={party} onChange={setParty} max={venue.maxTableSeats + 4} />}</Field>
        </div>

        {availableZones.length > 1 && (
          <Field label="Seating">
            {() => (
              <Segmented
                value={zone}
                onChange={setZone}
                options={[
                  { value: null, label: 'No preference' },
                  ...availableZones.map((z) => ({ value: z, label: ZONES[z]?.label ?? z })),
                ]}
              />
            )}
          </Field>
        )}

        <TextField
          label="Full name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          placeholder="Who should we expect?"
        />
        <TextField
          label="Phone number"
          required
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          placeholder="+91 98 XXXX XXXX"
          hint="The venue may call to confirm."
        />
        <TextArea
          label="Special requests (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Allergies, occasion, seating preference…"
        />

        {venue.prepaid && (
          <div className="note note-brand">
            <Icon name="card" />
            This is a prepaid experience — {rupees(venue.prepaid)} per guest, charged on confirmation.
            Cancel up to {venue.policy.cancelHours} hours ahead for a full refund.
          </div>
        )}
      </form>
    </Sheet>
  );
}

function formatCountdownLabel(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
