import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BOOKING_TYPES, ZONES } from '../../data/cities.js';
import { formatTime, priceBand } from '../../lib/format.js';
import { rupees } from '../../lib/format.js';
import { Badge, Cover, DemandMeter, StarRating } from '../ui/Data.jsx';
import { Icon } from '../ui/Icon.jsx';

/**
 * A search result. This is where the "one card shape for every booking type"
 * decision lives: a free table, a chef's-counter seat and a prepaid tasting
 * menu all render through the same component, differing only in the type
 * badge and — for experiences — a price line.
 */
export function VenueCard({ venue, onOpen, onHoverPin }) {
  const [held, setHeld] = useState(null);
  const type = BOOKING_TYPES[venue.type];
  const soldOut = venue.slotsNear.length === 0;
  const navigate = useNavigate();

  const openBooking = (slotTime) => {
    navigate(`/r/${venue.slug}?time=${encodeURIComponent(slotTime)}#book`);
  };

  return (
    <article
      className={`vcard ${soldOut ? 'is-soldout' : ''}`}
      onMouseEnter={() => onHoverPin?.(venue.id)}
      onMouseLeave={() => onHoverPin?.(null)}
    >
      <button type="button" className="vcard_media" onClick={() => onOpen(venue)}>
        <Cover
          seed={venue.slug}
          name={venue.name}
          src={venue.image}
          srcSet={venue.imageSrcSet}
          sizes="(max-width: 720px) 92vw, (max-width: 1080px) 45vw, 360px"
          size="lg"
          badge={venue.curated}
          alt=""
        />
      </button>

      <div className="vcard_body">
        <header className="vcard_head">
          <button type="button" className="vcard_title" onClick={() => onOpen(venue)}>
            <h3>{venue.name}</h3>
            <p className="vcard_meta">
              {venue.cuisine}
              <span className="dot" />
              {priceBand(venue.price)}
              <span className="dot" />
              {venue.area}
              <span className="dot" />
              {venue.km} km
            </p>
          </button>
          <StarRating rating={venue.rating} reviews={venue.reviews} />
        </header>

        <p className="vcard_tagline">{venue.tagline}</p>

        <div className="vcard_tags">
          <Badge tone={type.tone === 'brand' ? 'brand' : type.tone === 'muted' ? 'muted' : 'neutral'} icon={type.icon}>
            {type.label}
            {venue.prepaid && ` · ${rupees(venue.prepaid)} prepaid`}
          </Badge>
          {venue.tables.slice(0, 3).reduce((zones, t) => {
            if (!zones.includes(t.zone)) zones.push(t.zone);
            return zones;
          }, []).slice(0, 2).map((zone) => (
            <Badge key={zone} tone="muted">
              {ZONES[zone]?.label ?? zone}
            </Badge>
          ))}
        </div>

        <DemandMeter demand={venue.demand} remaining={venue.remaining} />

        {soldOut ? (
          <div className="vcard_fallback">
            <p>
              <Icon name="info" /> No tables for {venue.slotsNear.length === 0 ? 'your party' : 'that time'}.
            </p>
            <div className="vcard_fallback_actions">
              <button type="button" className="slot is-fallback" onClick={() => navigate(`/r/${venue.slug}#waitlist`)}>
                <Icon name="hourglass" /> Join waitlist
              </button>
              <button type="button" className="slot is-ghost" onClick={() => navigate(`/r/${venue.slug}#waitlist`)}>
                <Icon name="bell" /> Notify me
              </button>
            </div>
          </div>
        ) : (
          <div className="vcard_slots">
            {venue.slotsNear.slice(0, 4).map((slot) => (
              <button
                key={slot.time}
                type="button"
                className={`slot ${slot.offset === 0 ? 'is-best' : ''} ${slot.scarce ? 'is-scarce' : ''} ${
                  held === slot.time ? 'is-held' : ''
                }`}
                onClick={() => {
                  setHeld(slot.time);
                  openBooking(slot.time);
                }}
              >
                {formatTime(slot.time)}
                {slot.offset === 0 && <span className="slot_flag">best match</span>}
                {slot.scarce && <span className="slot_flag is-scarce">last one</span>}
              </button>
            ))}
            {venue.combining && (
              <span className="vcard_note">
                <Icon name="info" /> Fits by combining two tables
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
