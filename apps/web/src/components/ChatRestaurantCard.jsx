import { Link } from 'react-router-dom';

function formatPriceRange(priceRange) {
  if (!priceRange) return null;
  const min = Math.round(priceRange.minInPaise / 100);
  const max = Math.round(priceRange.maxInPaise / 100);
  if (min === max) return `₹${min}`;
  return `₹${min}–₹${max}`;
}

/**
 * Compact restaurant card for chat recommendations.
 * No existing card component existed — this is the smallest addition for links.
 */
export function ChatRestaurantCard({ restaurant }) {
  const price = formatPriceRange(restaurant.priceRange);
  const zones = (restaurant.zones ?? []).map((z) => z.toLowerCase()).join(' · ');
  const bookTo = `/?restaurant=${encodeURIComponent(restaurant.slug)}#reserve`;

  return (
    <article className="chat_restaurant_card">
      <div className="chat_restaurant_card_body">
        <h4>{restaurant.name}</h4>
        <p className="chat_restaurant_meta">{restaurant.address}</p>
        {(price || zones) && (
          <p className="chat_restaurant_meta">
            {[price, zones].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <Link to={bookTo} className="btn btn-primary btn-small chat_restaurant_cta">
        Book a table
      </Link>
    </article>
  );
}
