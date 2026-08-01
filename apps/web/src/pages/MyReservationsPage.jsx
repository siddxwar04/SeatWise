import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../context/ToastContext.jsx';
import { ApiError, reservationApi } from '../lib/api.js';

/**
 * "My Reservations" — audit finding #4: a user who booked had no record of it
 * anywhere. No confirmation, no reference, no list. This page only became
 * possible once users and reservations shared a database.
 */

const STATUS_LABELS = {
  PENDING: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  SEATED: 'Seated',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'Missed',
};

function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function MyReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [status, setStatus] = useState('loading');
  const [filter, setFilter] = useState('upcoming');
  const [cancellingId, setCancellingId] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const params = filter === 'upcoming' ? { upcoming: 'true', pageSize: 50 } : { pageSize: 50 };
      const data = await reservationApi.mine(params);
      setReservations(data.reservations);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async (reservation) => {
    // A booking is a real commitment on the restaurant's side, so this is one
    // of the few places a confirmation prompt earns its interruption.
    const confirmed = window.confirm(
      `Cancel your booking for ${reservation.partySize} on ${formatDate(reservation.date)} at ${reservation.time}?`,
    );
    if (!confirmed) return;

    setCancellingId(reservation.id);
    try {
      await reservationApi.cancel(reservation.id);
      toast.success('Reservation cancelled.');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel. Please try again.');
    } finally {
      setCancellingId(null);
    }
  };

  const canCancel = (r) => ['PENDING', 'CONFIRMED'].includes(r.status);

  return (
    <main className="page_wrapper container">
      <header className="page_header">
        <span className="tag">Your Table</span>
        <h1>My Reservations</h1>
        <p>Everything you have booked with us, past and upcoming.</p>
      </header>

      <div className="filter_row" role="group" aria-label="Filter reservations">
        <button
          type="button"
          className={filter === 'upcoming' ? 'tab_btn active' : 'tab_btn'}
          onClick={() => setFilter('upcoming')}
        >
          Upcoming
        </button>
        <button
          type="button"
          className={filter === 'all' ? 'tab_btn active' : 'tab_btn'}
          onClick={() => setFilter('all')}
        >
          All bookings
        </button>
      </div>

      {status === 'loading' && <p className="menu_state">Loading your reservations…</p>}

      {status === 'error' && (
        <p className="menu_state menu_state_error">
          We could not load your reservations. Please refresh the page.
        </p>
      )}

      {status === 'ready' && reservations.length === 0 && (
        <div className="empty_state">
          <p>
            {filter === 'upcoming'
              ? 'No upcoming reservations.'
              : 'You have not booked with us yet.'}
          </p>
          <Link to="/#reserve" className="btn btn-primary">
            Book a table
          </Link>
        </div>
      )}

      <div className="reservation_list">
        {reservations.map((r) => (
          <article className="reservation_card" key={r.id}>
            <div className="reservation_card_main">
              <p className="reservation_ref">{r.reference}</p>
              <h3>
                {formatDate(r.date)} · {r.time}
              </h3>
              <p className="reservation_meta">
                {r.partySize} {r.partySize === 1 ? 'guest' : 'guests'}
                {r.table ? ` · Table ${r.table.label}` : ''}
                {r.table ? ` · ${r.table.zone.toLowerCase()}` : ''}
              </p>
              {r.specialRequests && <p className="reservation_note">“{r.specialRequests}”</p>}
            </div>

            <div className="reservation_card_side">
              <span className={`status_pill status_${r.status.toLowerCase()}`}>
                {STATUS_LABELS[r.status] ?? r.status}
              </span>
              {canCancel(r) && (
                <button
                  type="button"
                  className="btn btn-login btn-small"
                  onClick={() => handleCancel(r)}
                  disabled={cancellingId === r.id}
                >
                  {cancellingId === r.id ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
