import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Cover, EmptyState, Skeleton, StatusBadge } from '../components/ui/Data.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Tabs } from '../components/ui/Overlay.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDate, formatTime, guests, rupees } from '../lib/format.js';
import { useAsync } from '../lib/hooks.js';
import { cancelBooking, listMyBookings } from '../services/marketplace.js';
import { ApiError } from '../lib/api.js';

const CANCELLABLE = ['PENDING', 'CONFIRMED'];

export function MyBookingsPage() {
  const [filter, setFilter] = useState('upcoming');
  const [cancellingRef, setCancellingRef] = useState(null);
  const toast = useToast();

  const { data, status, reload } = useAsync(() => listMyBookings({ filter }), [filter]);

  const handleCancel = async (booking) => {
    const confirmed = window.confirm(
      `Cancel your booking at ${booking.venue.name} for ${formatDate(booking.date)} at ${formatTime(booking.time)}?`,
    );
    if (!confirmed) return;

    setCancellingRef(booking.reference);
    try {
      await cancelBooking(booking.reference);
      toast.success('Reservation cancelled.');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel. Please try again.');
    } finally {
      setCancellingRef(null);
    }
  };

  const bookings = data ?? [];

  return (
    <div className="wrap page mybookings">
      <header className="page_header">
        <span className="eyebrow">Your table</span>
        <h1>My bookings</h1>
        <p>Everything you have reserved with SeatWise, past and upcoming.</p>
      </header>

      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'all', label: 'All bookings' },
        ]}
      />

      <div className="booking_list">
        {status === 'loading' &&
          Array.from({ length: 3 }, (_, i) => (
            <div className="booking_row is-skeleton" key={i}>
              <Skeleton w={12} h={12} radius="50%" />
              <div style={{ flex: 1 }}>
                <Skeleton w={40} h={16} />
                <Skeleton w={60} h={13} />
              </div>
            </div>
          ))}

        {status === 'ready' && bookings.length === 0 && (
          <EmptyState icon="calendar" title={filter === 'upcoming' ? 'Nothing coming up' : 'No bookings yet'}>
            {filter === 'upcoming'
              ? 'When you book a table it will show up here.'
              : 'Find a restaurant on Discover to make your first booking.'}
            <Button variant="primary" to="/" style={{ marginTop: 'var(--s-3)' }}>
              Discover restaurants
            </Button>
          </EmptyState>
        )}

        {status === 'ready' &&
          bookings.map((booking) => (
            <article className="booking_row" key={booking.reference}>
              <Cover seed={booking.venue.slug} name={booking.venue.name} size="sm" />

              <div className="booking_row_main">
                <div className="row spread">
                  <Link to={`/r/${booking.venue.slug}`} className="booking_row_title">
                    {booking.venue.name}
                  </Link>
                  <StatusBadge status={booking.status} />
                </div>
                <p className="booking_row_meta">
                  {formatDate(booking.date)} · {formatTime(booking.time)} · {guests(booking.partySize)}
                  {booking.zone && ` · ${booking.zone.toLowerCase()}`}
                </p>
                <p className="booking_row_ref mono">{booking.reference}</p>
                {booking.note && <p className="booking_row_note">“{booking.note}”</p>}
                {booking.prepaidPaise && (
                  <Badge tone="brand" icon="card">
                    {rupees(booking.prepaidPaise)} prepaid
                  </Badge>
                )}
              </div>

              {CANCELLABLE.includes(booking.status) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCancel(booking)}
                  loading={cancellingRef === booking.reference}
                >
                  Cancel
                </Button>
              )}
            </article>
          ))}
      </div>
    </div>
  );
}
