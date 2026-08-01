import { Link } from 'react-router-dom';

/**
 * Same three-column layout and class names. Fixes from the audit:
 *
 *  #26 — "Quick Links" were bare <li> elements with cursor:pointer and a hover
 *        colour but no href. They looked clickable and were not, and could not
 *        be reached by keyboard at all. Now real anchors.
 *  #29 — social icons were bare <i> tags. Now focusable links with labels.
 *  #31 — "Yelahnka,Banglore" was misspelled twice and missing a space, and the
 *        footer said © 2024 while the hero said Est. 2025.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer id="contact">
      <div className="container footer_container">
        <div className="footer_col">
          <h3>TastyFood.</h3>
          <p>
            Bringing the world&apos;s finest flavors to your table. Fresh ingredients, expert
            chefs, and a passion for food.
          </p>
          <div className="social_icons">
            <a href="https://facebook.com" aria-label="TastyFood on Facebook" rel="noreferrer noopener" target="_blank">
              <i className="fa-brands fa-facebook" aria-hidden="true" />
            </a>
            <a href="https://instagram.com" aria-label="TastyFood on Instagram" rel="noreferrer noopener" target="_blank">
              <i className="fa-brands fa-instagram" aria-hidden="true" />
            </a>
            <a href="https://twitter.com" aria-label="TastyFood on X" rel="noreferrer noopener" target="_blank">
              <i className="fa-brands fa-twitter" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="footer_col">
          <h3>Quick Links</h3>
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/#menu">Full Menu</Link>
            </li>
            <li>
              <Link to="/#reserve">Reservations</Link>
            </li>
            <li>
              <Link to="/my-reservations">My Bookings</Link>
            </li>
          </ul>
        </div>

        <div className="footer_col">
          <h3>Contact Us</h3>
          <ul>
            <li>
              <i className="fa-solid fa-phone" aria-hidden="true" />{' '}
              <a href="tel:+915559876543">(555) 987-6543</a>
            </li>
            <li>
              <i className="fa-solid fa-envelope" aria-hidden="true" />{' '}
              <a href="mailto:bookings@tastyfood.com">bookings@tastyfood.com</a>
            </li>
            <li>
              <i className="fa-solid fa-location-dot" aria-hidden="true" /> Yelahanka, Bangalore
            </li>
          </ul>
        </div>
      </div>
      <div className="footer_bottom">
        <p>&copy; {year} TastyFood Restaurant. All Rights Reserved.</p>
      </div>
    </footer>
  );
}
