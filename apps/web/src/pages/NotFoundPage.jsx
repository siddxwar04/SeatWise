import { EmptyState } from '../components/ui/Data.jsx';
import { Button } from '../components/ui/Button.jsx';

export function NotFoundPage() {
  return (
    <div className="wrap notfound_page">
      <EmptyState icon="search" title="We could not find that page">
        The link may be old, or the page may have moved.
        <div style={{ marginTop: 'var(--s-4)' }}>
          <Button variant="primary" to="/">
            Back to Discover
          </Button>
        </div>
      </EmptyState>
    </div>
  );
}
