import { Link } from 'react-router-dom';

/** Audit #23: no custom 404. Every unknown path returned a blank white page. */
export function NotFoundPage() {
  return (
    <main className="page_wrapper container">
      <div className="empty_state">
        <span className="tag">404</span>
        <h1>We could not find that page.</h1>
        <p>The link may be old, or the page may have moved.</p>
        <Link to="/" className="btn btn-primary">
          Back to the menu
        </Link>
      </div>
    </main>
  );
}
