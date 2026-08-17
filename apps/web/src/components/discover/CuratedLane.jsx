import { priceBand } from '../../lib/format.js';
import { venueGallery, venueHeroSrcSet, venueImage } from '../../data/venuePhotos.js';

function Shot({ src, srcSet, sizes, alt = '', className, loading = 'lazy' }) {
  return (
    <img
      className={className}
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={(event) => {
        event.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
}

/**
 * Editorial picks: one featured house, then a quieter row of the rest.
 *
 * A uniform scroller of equal cards reads as a product grid. A large hero with
 * a supporting gallery is how a guide (Resy, a Michelin city page) presents
 * "what we would book tonight" without displacing the search results below.
 */
export function CuratedLane({ venues, onOpen }) {
  if (!venues.length) return null;

  const [featured, ...rest] = venues;
  const gallery = venueGallery(featured.slug);
  const heroSrc = venueImage(featured.slug);

  return (
    <section className="lane_wrap" aria-label="Curated picks">
      <div className="lane_head">
        <h2>Curated for tonight</h2>
        <span className="lane_hint">Editorial picks — never displaces your search results</span>
      </div>

      <div className="lane_feature">
        <button type="button" className="lane_hero" onClick={() => onOpen(featured)}>
          <Shot
            className="lane_hero_img"
            src={heroSrc}
            srcSet={venueHeroSrcSet(featured.slug)}
            sizes="100vw"
            loading="eager"
            alt=""
          />
          <span className="lane_hero_scrim">
            {featured.curated && <span className="lane_tag">{featured.curated}</span>}
            <strong className="lane_hero_name display">{featured.name}</strong>
            <span className="lane_hero_meta">
              {featured.cuisine} · {priceBand(featured.price)}
              {featured.area ? ` · ${featured.area}` : ''}
            </span>
          </span>
        </button>

        {gallery.length > 0 && (
          <div className="lane_gallery" aria-hidden="true">
            {gallery.map((shot, index) => (
              <button
                key={`${featured.slug}-g${index}`}
                type="button"
                className="lane_gallery_shot"
                onClick={() => onOpen(featured)}
                tabIndex={-1}
              >
                <Shot
                  src={shot.src}
                  srcSet={shot.srcSet}
                  sizes="(max-width: 860px) 46vw, 24vw"
                  alt=""
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {rest.length > 0 && (
        <div className="lane_rest">
          {rest.map((venue) => (
            <button key={venue.id} type="button" className="lane_card" onClick={() => onOpen(venue)}>
              <span className="lane_card_media">
                <Shot
                  src={venue.image}
                  srcSet={venue.imageSrcSet}
                  sizes="(max-width: 720px) 46vw, 22vw"
                  alt=""
                />
              </span>
              {venue.curated && <span className="lane_tag">{venue.curated}</span>}
              <strong className="display">{venue.name}</strong>
              <span className="lane_meta">
                {venue.cuisine} · {priceBand(venue.price)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
