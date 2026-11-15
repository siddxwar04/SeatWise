import { useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { formatTime } from '../../lib/format.js';
import { LIVE_API } from '../../services/config.js';
import { joinWaitlist } from '../../services/marketplace.js';
import { Button } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { SelectField, Stepper, TextField } from '../ui/Field.jsx';
import { Sheet } from '../ui/Overlay.jsx';

/**
 * Joining the remote queue for a full or no-reservation venue.
 *
 * The quoted wait is computed by the same bin-packing pass the host floor
 * runs (services/marketplace.js → assignTables) rather than a made-up number
 * — a guest and a host seeing different wait estimates is how trust in a
 * waitlist product dies.
 */
export function WaitlistSheet({ venue, open, onClose }) {
  const [party, setParty] = useState(2);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const toast = useToast();

  // The live waitlist is per seating and notifies by email, so it needs a
  // contact and a time. The demo queue needs neither.
  const times = venue.waitlistTimes ?? [];
  const [guest, setGuest] = useState({ name: '', phone: '', email: '' });
  const [time, setTime] = useState('');
  const [errors, setErrors] = useState({});
  const chosenTime = time || times[0] || '';
  const nothingToQueueFor = LIVE_API && times.length === 0;

  const updateGuest = (field) => (e) => {
    setGuest((g) => ({ ...g, [field]: e.target.value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const join = async () => {
    setBusy(true);
    setErrors({});
    try {
      const outcome = await joinWaitlist({
        venueSlug: venue.slug,
        partySize: party,
        guest,
        time: chosenTime,
      });
      setResult(outcome);
    } catch (err) {
      if (err?.details) setErrors(err.details);
      toast.error(
        LIVE_API && err?.message ? err.message : 'Could not join the waitlist. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    onClose();
    setResult(null);
  };

  return (
    <Sheet open={open} onClose={close} title={`Join the queue — ${venue.name}`}>
      {result ? (
        <div className="booked">
          <span className="booked_icon">
            <Icon name="hourglass" />
          </span>
          <h3>{result.seatedNow ? "You're up" : "You're on the list"}</h3>
          <p>
            {result.live
              ? result.message
              : result.seatedNow
                ? 'A table is free right now — head to the host stand.'
                : `About ${result.quotedMinutes} minutes · position ${result.position} of ${result.ahead + 1}`}
          </p>
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="stack">
          <p className="lede" style={{ fontSize: 'var(--t-sm)' }}>
            {venue.name} does not take reservations. Join the queue and we will text you when your
            table is close.
          </p>
          <div className="field">
            <label className="field_label">Party size</label>
            <Stepper value={party} onChange={setParty} max={12} />
          </div>
          {LIVE_API && nothingToQueueFor && (
            <p className="note note-warn">
              <Icon name="info" />
              There are no more seatings to queue for today.
            </p>
          )}
          {LIVE_API && !nothingToQueueFor && (
            <>
              <SelectField
                label="Seating"
                value={chosenTime}
                onChange={(e) => setTime(e.target.value)}
                options={times.map((t) => ({ value: t, label: formatTime(t) }))}
              />
              <TextField
                label="Full name"
                required
                value={guest.name}
                onChange={updateGuest('name')}
                error={errors.name}
              />
              <TextField
                label="Phone number"
                required
                type="tel"
                value={guest.phone}
                onChange={updateGuest('phone')}
                error={errors.phone}
              />
              <TextField
                label="Email address"
                required
                type="email"
                value={guest.email}
                onChange={updateGuest('email')}
                error={errors.email}
                hint="We email you if a table opens."
              />
            </>
          )}
          <Button
            variant="primary"
            block
            loading={busy}
            disabled={nothingToQueueFor}
            onClick={join}
          >
            Join queue
          </Button>
        </div>
      )}
    </Sheet>
  );
}
