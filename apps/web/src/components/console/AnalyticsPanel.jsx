import { Bar, StatTile } from '../ui/Data.jsx';
import { percent, rupees } from '../../lib/format.js';

function heatTone(rate) {
  if (rate >= 0.3) return 'heat-4';
  if (rate >= 0.2) return 'heat-3';
  if (rate >= 0.1) return 'heat-2';
  if (rate > 0) return 'heat-1';
  return 'heat-0';
}

/**
 * The analytics an owner actually acts on: occupancy and revenue per
 * table-hour up top, then the no-show heatmap and the two breakdowns
 * (lead time, party size) that tell them *which* policy lever to pull —
 * a deposit for first-time Friday bookers, say — instead of a blanket rule.
 */
export function AnalyticsPanel({ analytics }) {
  const maxLeadShare = Math.max(...analytics.byLeadTime.map((b) => b.rate));
  const maxPartyShare = Math.max(...analytics.byPartySize.map((b) => b.rate));

  return (
    <div className="stack">
      <div className="stat_grid">
        <StatTile label="Occupancy (30d)" value={`${Math.round(analytics.occupancy * 100)}%`} icon="gauge" />
        <StatTile
          label="Revenue / table-hour"
          value={rupees(analytics.revenuePerTableHourPaise)}
          icon="trend-up"
        />
        <StatTile label="No-show rate" value={percent(analytics.noShowRate)} icon="percent" tone="warn" />
        <StatTile
          label="Lost revenue (30d)"
          value={rupees(analytics.lostRevenuePaise)}
          icon="alert"
          tone="danger"
        />
      </div>

      <div className="panel">
        <div className="panel_head">
          <div>
            <h2>No-show heatmap</h2>
            <p>Day × hour. Colour is the no-show rate among bookings in that cell.</p>
          </div>
        </div>
        <div className="panel_body">
          <div
            className="heatmap"
            style={{ gridTemplateColumns: `3.5rem repeat(${analytics.hours.length}, 1fr)` }}
          >
            <div />
            {analytics.hours.map((h) => (
              <div key={h} className="heatmap_hour">
                {h}:00
              </div>
            ))}
            {analytics.heatmap.map((row) => (
              <div key={row.day} style={{ display: 'contents' }}>
                <div className="heatmap_day">{row.day}</div>
                {row.cells.map((cell) => (
                  <div
                    key={`${row.day}-${cell.hour}`}
                    className={`heatmap_cell ${heatTone(cell.rate)}`}
                    title={`${row.day} ${cell.hour}:00 — ${cell.bookings} bookings, ${cell.noShows} no-shows (${percent(cell.rate)})`}
                  >
                    {cell.noShows || ''}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'stretch', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
        <div className="panel" style={{ flex: 1, minWidth: 280 }}>
          <div className="panel_head">
            <div>
              <h2>By lead time</h2>
              <p>Longer-out bookings run riskier</p>
            </div>
          </div>
          <div className="panel_body stack" style={{ gap: 'var(--s-3)' }}>
            {analytics.byLeadTime.map((b) => (
              <Bar
                key={b.bucket}
                label={b.bucket}
                value={b.rate}
                scale={maxLeadShare}
                tone={b.rate === maxLeadShare ? 'danger' : 'brand'}
                right={percent(b.rate)}
              />
            ))}
          </div>
        </div>

        <div className="panel" style={{ flex: 1, minWidth: 280 }}>
          <div className="panel_head">
            <div>
              <h2>By party size</h2>
              <p>Smaller parties run riskier, not bigger ones</p>
            </div>
          </div>
          <div className="panel_body stack" style={{ gap: 'var(--s-3)' }}>
            {analytics.byPartySize.map((b) => (
              <Bar
                key={b.bucket}
                label={b.bucket}
                value={b.rate}
                scale={maxPartyShare}
                tone={b.rate === maxPartyShare ? 'danger' : 'brand'}
                right={percent(b.rate)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel_head">
          <div>
            <h2>Confirmed vs. never answered</h2>
          </div>
        </div>
        <div className="panel_body stack" style={{ gap: 'var(--s-3)' }}>
          {analytics.byConfirmation.map((b) => (
            <Bar
              key={b.bucket}
              label={b.bucket}
              value={b.rate}
              scale={Math.max(...analytics.byConfirmation.map((x) => x.rate))}
              tone={b.bucket === 'Confirmed' ? 'ok' : 'danger'}
              right={percent(b.rate)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
