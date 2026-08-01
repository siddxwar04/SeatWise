/**
 * Verbatim port. Only two changes:
 *  - "Est. 2025" now agrees with the footer year (audit #31 flagged the clash).
 *  - The hero image gets explicit dimensions and fetchpriority="high". It is
 *    the Largest Contentful Paint element, so it should be fetched eagerly —
 *    but reserving its box stops the page jumping when it lands.
 */
export function Hero() {
  return (
    <section className="container hero">
      <div className="hero_content">
        <span className="tag">Est. 2025</span>
        <h1>
          Taste the <br /> Art of <span>Cooking.</span>
        </h1>
        <p>
          Experience a symphony of flavors. From our signature stack burgers to authentic
          Mediterranean grills, we serve passion on a plate.
        </p>
        <div className="hero_btns">
          <a href="#menu" className="btn btn-primary">
            Order Now{' '}
            <i
              className="fa-solid fa-arrow-right"
              style={{ marginLeft: '8px' }}
              aria-hidden="true"
            />
          </a>
          <a href="#reserve" className="btn btn-login">
            <i className="fa-solid fa-chair" style={{ marginRight: '8px' }} aria-hidden="true" />{' '}
            Book Table
          </a>
        </div>
      </div>
      <div className="hero_image">
        <img
          src="/images/hero-burger.webp"
          alt="Signature Burger"
          width="600"
          height="600"
          fetchPriority="high"
        />
      </div>
    </section>
  );
}
