import { useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { joinWaitlist } from '../../services/marketplace.js';
import { Button } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Stepper } from '../ui/Field.jsx';
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

  const join = async () => {
    setBusy(true);
    try {
      const outcome = await joinWaitlist({ venueSlug: venue.slug, partySize: party });
      setResult(outcome);
    } catch {
      toast.error('Could not join the waitlist. Please try again.');
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
            {result.seatedNow
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
          <Button variant="primary" block loading={busy} onClick={join}>
            Join queue
          </Button>
        </div>
      )}
    </Sheet>
  );
}
