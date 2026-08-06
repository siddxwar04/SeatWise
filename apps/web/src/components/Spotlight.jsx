import { useNavigate } from 'react-router-dom';

/**
 * Verbatim port. The "₹499 - Order Now" button was inert (audit #13 — no cart,
 * no order table, no payment). Ordering is genuinely out of scope for a
 * reservations product, so rather than leave a dead button it now does the
 * honest thing and takes you to the booking form.
 */
export function Spotlight() {
  const navigate = useNavigate();

  return (
    <section className="spotlight_section">
      <div className="container spotlight_grid">
        <div className="spotlight_img">
          <img
            src="/images/special.webp"
            alt="The Morning Glory Burger"
            loading="lazy"
            width="600"
            height="600"
          />
        </div>
        <div className="spotlight_content">
          <span className="tag">Chef&apos;s Masterpiece</span>
          <h2>The &quot;Morning Glory&quot;</h2>
          <p>
            Our award-winning brunch burger. A succulent wagyu beef patty topped with smoked turkey
            bacon, melted gouda, and a perfectly runny sunny-side-up egg on a toasted brioche.
          </p>
          <ul className="spotlight_list">
            <li>
              <i className="fa-solid fa-fire" aria-hidden="true" /> Flame-Grilled Wagyu
            </li>
            <li>
              <i className="fa-solid fa-egg" aria-hidden="true" /> Farm-Fresh Organic Egg
            </li>
            <li>
              <i className="fa-solid fa-bread-slice" aria-hidden="true" /> House-Made Brioche
            </li>
          </ul>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/#reserve')}>
            ₹499 - Reserve a Table
          </button>
        </div>
      </div>
    </section>
  );
}
