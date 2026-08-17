import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BOOKING_TYPES, ZONES } from '../data/cities.js';
import { BookingSheet } from '../components/venue/BookingSheet.jsx';
import { WaitlistSheet } from '../components/venue/WaitlistSheet.jsx';
import { Badge, Bar, Cover, DemandMeter, StarRating } from '../components/ui/Data.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Button } from '../components/ui/Button.jsx';
import { formatDateLong, formatTime, priceBand, rupees, timeAgo, todayISO } from '../lib/format.js';
import { useAsync } from '../lib/hooks.js';
import { getVenueDetail } from '../services/marketplace.js';

/**
 * Venue detail: the page a search result becomes when you commit to it.
 *
 * Slots are booked straight from this page's own list, not a separate
 * checkout route — the common case ("any of these evening times works") never
 * needs more than one screen beyond search.
 */
export function VenuePage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [sheetTime, setSheetTime] = useState(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const { data, status } = useAsync(() => getVenueDetail(slug), [slug]);

  // A card in search can deep-link straight to a slot via ?time=.
  useEffect(() => {
    const requested = searchParams.get('time');
    if (requested && data?.venue.slots.some((s) => s.time === requested)) {
      setSheetTime(requested);
    }
  }, [searchParams, data]);

  if (status === 'loading') {
    return (
      <div className="wrap page">
        <p className="menu_state">Loading…</p>
      </div>
    );
  }

  if (status === 'error' || !data) {
    return (
      <div className="wrap page">
        <p className="menu_state">We could not find that restaurant.</p>
        <Link to="/" className="btn btn-primary">
          Back to Discover
        </Link>
      </div>
    );
  }

  const { venue, reviews, ratings, similar, city } = data;
  const type = BOOKING_TYPES[venue.type];
  const soldOut = venue.slots.length === 0;
  const maxRatingCount = Math.max(...ratings.map((r) => r.count));

  return (
    <div className="vpage">
      <Cover
        seed={venue.slug}
        name={venue.name}
        src={venue.image}
        srcSet={venue.imageSrcSet}
        sizes="100vw"
        size="wide"
        className="vpage_cover"
        loading="eager"
        alt=""
      />

      <div className="wrap vpage_layout">
        <div className="vpage_main">
          <header className="vpage_head">
            <div className="vpage_head_top">
              <div>
                <span className="eyebrow">
                  <Icon name="pin" /> {venue.area}, {city.name}
                </span>
                <h1 className="vpage_title display">{venue.name}</h1>
              </div>
              <StarRating rating={venue.rating} reviews={venue.reviews} size="lg" />
            </div>

            <p className="vpage_meta">
              {venue.cuisine}
              <span className="dot" />
              {priceBand(venue.price)}
              <span className="dot" />
              {venue.area}
              <span className="dot" />
              Since {venue.since}
            </p>

            <div className="vpage_tags">
              <Badge tone={type.tone === 'brand' ? 'brand' : 'neutral'} icon={type.icon}>
                {type.label}
              </Badge>
              {venue.curated && <Badge tone="brand">{venue.curated}</Badge>}
              {venue.tables
                .reduce((zones, t) => (zones.includes(t.zone) ? zones : [...zones, t.zone]), [])
                .map((zone) => (
                  <Badge key={zone} tone="muted" icon={ZONES[zone]?.icon}>
                    {ZONES[zone]?.label}
                  </Badge>
                ))}
            </div>

            <p className="vpage_about">{venue.about}</p>
          </header>

          <section className="vpage_section">
            <h2>Signature dishes</h2>
            <ul className="vpage_sig">
              {venue.signatures.map((dish) => (
                <li key={dish}>
                  <Icon name="sparkles" />
                  {dish}
                </li>
              ))}
            </ul>
          </section>

          <section className="vpage_section">
            <div className="row spread">
              <h2>Guest reviews</h2>
              <StarRating rating={venue.rating} reviews={venue.reviews} />
            </div>

            <div className="ratings_hist">
              {ratings.map((r) => (
                <Bar key={r.stars} label={`${r.stars}★`} value={r.count} scale={maxRatingCount} right={r.count} />
              ))}
            </div>

            <div className="reviews">
              {reviews.map((review) => (
                <article key={review.id} className="review">
                  <header>
                    <span className="review_avatar">{review.author.slice(0, 1)}</span>
                    <div>
                      <strong>{review.author}</strong>
                      <span className="review_meta">
                        {review.occasion} · party of {review.partySize}
                        {review.verified && (
                          <>
                            {' '}
                            <Icon name="check" /> Verified booking
                          </>
                        )}
                      </span>
                    </div>
                    <StarRating rating={review.stars} />
                  </header>
                  <p>{review.body}</p>
                  <span className="review_time">{review.daysAgo} days ago</span>
                </article>
              ))}
            </div>
          </section>

          <section className="vpage_section">
            <h2>Policies</h2>
            <ul className="policy_list">
              <li>
                <Icon name="clock" />
                Open {venue.hours.open}–{venue.hours.close}
              </li>
              <li>
                <Icon name="lock" />
                Slots held for {venue.policy.holdMinutes} minutes once you start booking
              </li>
              <li>
                <Icon name="calendar" />
                Free cancellation up to {venue.policy.cancelHours || 'any time before'} hours ahead
              </li>
              <li>
                <Icon name="users" />
                Parties of {venue.policy.largePartyFrom}+ may be asked to call ahead
              </li>
              {venue.prepaid && (
                <li>
                  <Icon name="card" />
                  Prepaid at {rupees(venue.prepaid)} per guest
                </li>
              )}
            </ul>
          </section>

          {similar.length > 0 && (
            <section className="vpage_section">
              <h2>Similar restaurants nearby</h2>
              <div className="similar_grid">
                {similar.map((v) => (
                  <Link key={v.slug} to={`/r/${v.slug}`} className="similar_card">
                    <Cover seed={v.slug} name={v.name} src={v.image} size="sm" alt="" />
                    <div>
                      <strong>{v.name}</strong>
                      <span>
                        {v.cuisine} · {priceBand(v.price)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="vpage_book" id="book">
          <div className="vpage_book_card">
            <DemandMeter demand={venue.demand} remaining={venue.remaining} />

            {soldOut ? (
              <div className="stack">
                <p className="note note-warn">
                  <Icon name="info" />
                  Fully booked for tonight. Join the queue and we will text you the moment a table
                  opens.
                </p>
                <Button variant="primary" block icon="hourglass" onClick={() => setWaitlistOpen(true)}>
                  Join waitlist
                </Button>
              </div>
            ) : (
              <>
                <p className="vpage_book_label">Available times, {formatDateLong(todayISO())}</p>
                <div className="vcard_slots">
                  {venue.slots.map((slot) => (
                    <button
                      key={slot.time}
                      type="button"
                      className={`slot ${slot.best ? 'is-best' : ''} ${slot.scarce ? 'is-scarce' : ''}`}
                      onClick={() => setSheetTime(slot.time)}
                    >
                      {formatTime(slot.time)}
                      {slot.best && <span className="slot_flag">best</span>}
                      {slot.scarce && <span className="slot_flag is-scarce">last</span>}
                    </button>
                  ))}
                </div>
                {venue.walkIn && (
                  <p className="vpage_book_note">
                    <Icon name="user" /> Also takes walk-ins, subject to availability.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="vpage_contact">
            <a href={`tel:${venue.phone.replace(/\s/g, '')}`}>
              <Icon name="phone" /> {venue.phone}
            </a>
            <span>
              <Icon name="pin" /> {venue.address}
            </span>
          </div>
        </aside>
      </div>

      {sheetTime && (
        <BookingSheet
          venue={venue}
          date={todayISO()}
          open={Boolean(sheetTime)}
          initialTime={sheetTime}
          onClose={() => setSheetTime(null)}
        />
      )}
      <WaitlistSheet venue={venue} open={waitlistOpen} onClose={() => setWaitlistOpen(false)} />
    </div>
  );
}
