import { Link, useParams } from 'react-router-dom';
import { Cover, StatusBadge } from '../components/ui/Data.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { formatDateLong, formatTime, guests, rupees } from '../lib/format.js';
import { useAsync } from '../lib/hooks.js';
import { getBooking } from '../services/marketplace.js';

/**
 * A permalink for one booking — what the confirmation SMS/email would link
 * to. Standalone from My Bookings so a reference can be shared or bookmarked.
 */
export function BookingConfirmPage() {
  const { reference } = useParams();
  const { data: booking, status } = useAsync(() => getBooking(reference), [reference]);

  if (status === 'loading') {
    return (
      <div className="wrap page">
        <p className="menu_state">Loading…</p>
      </div>
    );
  }

  if (status === 'error' || !booking) {
    return (
      <div className="wrap page">
        <div className="empty">
          <span className="empty_icon">
            <Icon name="alert" />
          </span>
          <h3>No booking with that reference</h3>
          <p>Double check the link, or find it under My bookings if you are signed in.</p>
          <Button variant="primary" to="/bookings">
            My bookings
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap page confirm_page">
      <div className="confirm_card">
        <Cover seed={booking.venue.slug} name={booking.venue.name} src={booking.venue.image} size="md" alt="" />
        <StatusBadge status={booking.status} />
        <h1>{booking.venue.name}</h1>
        <p className="confirm_when">
          {formatDateLong(booking.date)}
          <br />
          {formatTime(booking.time)} · {guests(booking.partySize)}
        </p>
        <p className="confirm_ref mono">{booking.reference}</p>

        {booking.prepaidPaise && (
          <p className="confirm_prepaid">
            <Icon name="card" /> {rupees(booking.prepaidPaise)} prepaid per guest
          </p>
        )}

        {booking.note && <p className="confirm_note">“{booking.note}”</p>}

        <div className="confirm_actions">
          <Button variant="secondary" to={`/r/${booking.venue.slug}`}>
            View restaurant
          </Button>
          <Button variant="primary" to="/bookings">
            My bookings
          </Button>
        </div>
      </div>
    </div>
  );
}
