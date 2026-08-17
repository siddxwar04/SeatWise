import { formatTime, guests, percent, rupees } from '../../lib/format.js';
import { BAND_LABEL } from '../../lib/risk.js';
import { RiskBadge } from '../ui/Data.jsx';
import { Icon } from '../ui/Icon.jsx';

const ACTION_COPY = {
  call: { icon: 'phone', label: 'Call to confirm', tone: 'danger' },
  remind: { icon: 'bell', label: 'Send reminder', tone: 'warn' },
  none: { icon: 'check', label: 'No action needed', tone: 'ok' },
};

/**
 * The risk queue: every open booking ranked by predicted no-show probability,
 * with the driver terms from risk.js shown per row — the "why", not just the
 * number, which is what makes a host actually trust and act on the score.
 */
export function RiskPanel({ queue }) {
  const bands = queue.bands;

  return (
    <div className="stack">
      <div className="risk_bands">
        {bands.map((b) => (
          <div key={b.band} className={`risk_band_card risk_band-${b.band}`}>
            <span className="risk_band_label">{BAND_LABEL[b.band]}</span>
            <strong className="num">{b.count}</strong>
            <span className="cell_sub">{b.covers} covers</span>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel_head">
          <div>
            <h2>Risk queue</h2>
            <p>Highest predicted no-show probability first</p>
          </div>
        </div>

        <div className="table_scroll">
          <table className="data_table">
            <caption className="sr-only">Open bookings ranked by no-show risk</caption>
            <thead>
              <tr>
                <th>Time</th>
                <th>Guest</th>
                <th>Party</th>
                <th>Risk</th>
                <th>Why</th>
                <th>Exposure</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {queue.queue.slice(0, 30).map((booking) => {
                const action = ACTION_COPY[booking.action];
                return (
                  <tr key={booking.reference}>
                    <td className="num">{formatTime(booking.time)}</td>
                    <td>
                      {booking.guestName}
                      <span className="cell_sub">{guests(booking.leadTimeDays)} lead-days ago</span>
                    </td>
                    <td>{booking.partySize}</td>
                    <td>
                      <RiskBadge risk={booking.risk} />
                    </td>
                    <td>
                      <span className="risk_why">{booking.risk.drivers[0]?.label ?? '—'}</span>
                    </td>
                    <td className="num">{rupees(booking.exposurePaise)}</td>
                    <td>
                      <span className={`risk_action risk_action-${action.tone}`}>
                        <Icon name={action.icon} />
                        {action.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {queue.queue.length === 0 && (
                <tr>
                  <td colSpan={7} className="cell_sub" style={{ padding: 'var(--s-6)', textAlign: 'center' }}>
                    No open bookings to score right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
