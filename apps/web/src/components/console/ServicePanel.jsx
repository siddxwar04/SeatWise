import { useState } from 'react';
import { formatTime, guests, rupees } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';
import { updateBookingStatus, sendReminder } from '../../services/console.js';
import { Button } from '../ui/Button.jsx';
import { RiskBadge, StatusBadge } from '../ui/Data.jsx';
import { Icon } from '../ui/Icon.jsx';

/**
 * Tonight's book, one slot at a time, with the action each status implies.
 *
 * `NEXT_ACTIONS` is the state machine a floor manager actually runs — a booking
 * only ever moves forward, and what "forward" means depends on where it is.
 */
const NEXT_ACTIONS = {
  PENDING: [
    { status: 'CONFIRMED', label: 'Confirm', tone: 'primary' },
    { status: 'CANCELLED', label: 'Decline', tone: 'ghost' },
  ],
  CONFIRMED: [
    { status: 'SEATED', label: 'Seat', tone: 'primary' },
    { status: 'NO_SHOW', label: 'No-show', tone: 'ghost' },
    { status: 'CANCELLED', label: 'Cancel', tone: 'ghost' },
  ],
  SEATED: [{ status: 'COMPLETED', label: 'Complete', tone: 'primary' }],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function ServicePanel({ service, onChanged }) {
  const [busyRef, setBusyRef] = useState(null);
  const toast = useToast();

  const act = async (booking, status) => {
    setBusyRef(booking.reference);
    try {
      await updateBookingStatus(booking.reference, status);
      toast.success(`${booking.reference} → ${status.toLowerCase().replace('_', ' ')}`);
      onChanged();
    } catch {
      toast.error('Could not update that booking.');
    } finally {
      setBusyRef(null);
    }
  };

  const remind = async (booking) => {
    setBusyRef(booking.reference);
    try {
      await sendReminder(booking.reference);
      toast.success(`Reminder sent for ${booking.reference}.`);
      onChanged();
    } catch {
      toast.error('Could not send the reminder.');
    } finally {
      setBusyRef(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel_head">
        <div>
          <h2>Tonight's book</h2>
          <p>{service.bookings.length} bookings · sorted by time</p>
        </div>
      </div>

      <div className="table_scroll">
        <table className="data_table">
          <caption className="sr-only">Reservations for today, with status actions</caption>
          <thead>
            <tr>
              <th>Time</th>
              <th>Guest</th>
              <th>Party</th>
              <th>Status</th>
              <th>No-show risk</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {service.bookings.map((booking) => {
              const actions = NEXT_ACTIONS[booking.status] ?? [];
              const busy = busyRef === booking.reference;
              const showReminder =
                booking.risk.band === 'high' && ['PENDING', 'CONFIRMED'].includes(booking.status);

              return (
                <tr key={booking.reference}>
                  <td className="num">{formatTime(booking.time)}</td>
                  <td>
                    {booking.guestName}
                    <span className="cell_sub">{booking.guestPhone}</span>
                    {booking.guest.priorNoShows > 0 && (
                      <span className="cell_sub" style={{ color: 'var(--danger)' }}>
                        {booking.guest.priorNoShows} prior no-show{booking.guest.priorNoShows === 1 ? '' : 's'}
                      </span>
                    )}
                  </td>
                  <td>{guests(booking.partySize)}</td>
                  <td>
                    <StatusBadge status={booking.status} />
                  </td>
                  <td>
                    <RiskBadge risk={booking.risk} />
                  </td>
                  <td>
                    <div className="cell_actions">
                      {actions.map((action) => (
                        <Button
                          key={action.status}
                          variant={action.tone === 'primary' ? 'primary' : 'ghost'}
                          size="sm"
                          disabled={busy}
                          onClick={() => act(booking, action.status)}
                        >
                          {action.label}
                        </Button>
                      ))}
                      {showReminder && (
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => remind(booking)}>
                          <Icon name="bell" /> Remind
                        </Button>
                      )}
                      {actions.length === 0 && !showReminder && <span className="cell_sub">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {service.bookings.length === 0 && (
              <tr>
                <td colSpan={6} className="cell_sub" style={{ padding: 'var(--s-6)', textAlign: 'center' }}>
                  No bookings today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
