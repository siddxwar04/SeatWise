import { useEffect, useState } from 'react';
import { AnalyticsPanel } from '../../components/console/AnalyticsPanel.jsx';
import { FloorPanel } from '../../components/console/FloorPanel.jsx';
import { OverbookingPanel } from '../../components/console/OverbookingPanel.jsx';
import { RiskPanel } from '../../components/console/RiskPanel.jsx';
import { ServicePanel } from '../../components/console/ServicePanel.jsx';
import { Cover, StatTile } from '../../components/ui/Data.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Tabs } from '../../components/ui/Overlay.jsx';
import { SelectField } from '../../components/ui/Field.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../lib/hooks.js';
import { rupees } from '../../lib/format.js';
import {
  getAnalytics,
  getFloor,
  getOverbooking,
  getRiskQueue,
  getService,
} from '../../services/console.js';

const TABS = [
  { id: 'service', label: "Tonight's book", icon: 'calendar-check' },
  { id: 'risk', label: 'Risk queue', icon: 'shield' },
  { id: 'overbooking', label: 'Overbooking', icon: 'trend-up' },
  { id: 'floor', label: 'Floor & waitlist', icon: 'seat' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
];

/**
 * The owner console — the supply-side half of the product, and the part the
 * research brief is actually about. Every number here comes from the three
 * algorithms in src/lib (risk.js, overbooking.js, assignment.js) run against
 * a generated book for the signed-in owner's venues; see services/console.js.
 */
export function ConsolePage() {
  const { managedVenues, isDemo } = useAuth();
  const [venueSlug, setVenueSlug] = useState(managedVenues[0]?.slug ?? '');
  const [tab, setTab] = useState('service');

  useEffect(() => {
    if (!venueSlug && managedVenues.length) setVenueSlug(managedVenues[0].slug);
  }, [managedVenues, venueSlug]);

  const { data: service, status: serviceStatus, reload } = useAsync(
    () => getService(venueSlug),
    [venueSlug],
  );
  const { data: risk } = useAsync(() => getRiskQueue(venueSlug), [venueSlug, service]);
  const { data: overbooking } = useAsync(() => getOverbooking(venueSlug), [venueSlug, service]);
  const { data: floor } = useAsync(() => getFloor(venueSlug), [venueSlug]);
  const { data: analytics } = useAsync(() => getAnalytics(venueSlug), [venueSlug]);

  if (!managedVenues.length) {
    return (
      <div className="wrap page">
        <div className="empty">
          <span className="empty_icon">
            <Icon name="store" />
          </span>
          <h3>No venue assigned</h3>
          <p>Your account is not linked to a restaurant. Sign in with the owner demo account to explore.</p>
        </div>
      </div>
    );
  }

  const venue = service?.venue;

  return (
    <div className="wrap page console">
      <header className="console_head">
        <div className="row" style={{ gap: 'var(--s-4)' }}>
          {venue && <Cover seed={venue.slug} name={venue.name} src={venue.image} size="sm" alt="" />}
          <div>
            <span className="eyebrow">Restaurant console</span>
            <h1>{venue?.name ?? 'Loading…'}</h1>
          </div>
        </div>

        {managedVenues.length > 1 && (
          <SelectField
            label="Venue"
            value={venueSlug}
            onChange={(e) => setVenueSlug(e.target.value)}
            options={managedVenues.map((v) => ({ value: v.slug, label: v.name }))}
          />
        )}
      </header>

      {isDemo && (
        <div className="note note-brand" style={{ marginBottom: 'var(--s-6)' }}>
          <Icon name="sparkles" />
          Demo owner account — every number below is generated from a seeded model of this venue's
          book, not a live database.
        </div>
      )}

      {service && (
        <section className="stat_grid console_summary">
          <StatTile label="Bookings today" value={service.summary.bookings} icon="calendar" />
          <StatTile label="Covers today" value={service.summary.covers} icon="users" />
          <StatTile
            label="No-show rate so far"
            value={service.summary.noShowRate === null ? '—' : `${Math.round(service.summary.noShowRate * 100)}%`}
            icon="percent"
          />
          <StatTile
            label="High-risk bookings"
            value={service.summary.atRisk}
            tone={service.summary.atRisk > 0 ? 'warn' : 'neutral'}
            icon="shield"
          />
          <StatTile
            label="Exposure tonight"
            value={rupees(service.summary.exposurePaise)}
            hint="Expected value at risk if nothing is done"
            tone="danger"
            icon="alert"
          />
        </section>
      )}

      <Tabs value={tab} onChange={setTab} tabs={TABS} />

      <div className="console_panel">
        {serviceStatus === 'loading' && <p className="menu_state">Loading console…</p>}

        {tab === 'service' && service && <ServicePanel service={service} onChanged={reload} />}
        {tab === 'risk' && risk && <RiskPanel queue={risk} />}
        {tab === 'overbooking' && overbooking && <OverbookingPanel plan={overbooking} />}
        {tab === 'floor' && floor && <FloorPanel floor={floor} />}
        {tab === 'analytics' && analytics && <AnalyticsPanel analytics={analytics} />}
      </div>
    </div>
  );
}
