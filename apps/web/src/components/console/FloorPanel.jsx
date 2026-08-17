import { ZONES } from '../../data/cities.js';
import { guests } from '../../lib/format.js';
import { Icon } from '../ui/Icon.jsx';
import { StatTile } from '../ui/Data.jsx';

/**
 * The floor: every table's live status, the waitlist, and the packed
 * assignment plan — shown next to what a "first table that fits" host would
 * have done, so the bin-packing algorithm's saving (lib/assignment.js) is
 * visible rather than asserted.
 */
export function FloorPanel({ floor }) {
  const { tables, parties, plan, comparison, occupancy } = floor;

  return (
    <div className="stack">
      <div className="stat_grid">
        <StatTile label="Occupancy" value={`${Math.round(occupancy * 100)}%`} icon="gauge" />
        <StatTile label="Waiting parties" value={parties.length} icon="hourglass" />
        <StatTile
          label="Seated by the planner"
          value={comparison.packedSeated}
          hint={`vs ${comparison.naiveSeated} first-fit`}
          icon="seat"
        />
        <StatTile
          label="Seats saved"
          value={comparison.seatsSaved}
          tone={comparison.seatsSaved > 0 ? 'brand' : 'neutral'}
          hint="vs. first-table-that-fits"
          icon="sparkles"
        />
      </div>

      <div className="floor_grid_wrap panel">
        <div className="panel_head">
          <div>
            <h2>Floor plan</h2>
            <p>{tables.filter((t) => t.status === 'free').length} tables free right now</p>
          </div>
        </div>
        <div className="floor_grid panel_body">
          {tables.map((table) => (
            <div key={table.id} className={`floor_table floor_table-${table.status}`}>
              <span className="floor_table_label">{table.label}</span>
              <span className="floor_table_seats">
                <Icon name="seat" /> {table.seats}
              </span>
              <span className="floor_table_zone">{ZONES[table.zone]?.label ?? table.zone}</span>
              {table.status !== 'free' && <span className="floor_table_turns">turns {table.turnsAt}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel_head">
          <div>
            <h2>Suggested seating</h2>
            <p>Waiting parties matched to free tables — largest party first, tightest fit</p>
          </div>
        </div>
        <div className="table_scroll">
          <table className="data_table">
            <caption className="sr-only">Assignment plan for waiting parties</caption>
            <thead>
              <tr>
                <th>Party</th>
                <th>Size</th>
                <th>Waited</th>
                <th>Table</th>
                <th>Seats wasted</th>
              </tr>
            </thead>
            <tbody>
              {plan.assignments.map((a) => (
                <tr key={a.party.id}>
                  <td>{a.party.guestName ?? 'Party'}</td>
                  <td>{guests(a.party.partySize)}</td>
                  <td>{a.party.waitedMinutes} min</td>
                  <td>
                    {a.tables.map((t) => t.label).join(' + ')}
                    {a.combined && <span className="cell_sub">combined</span>}
                  </td>
                  <td className="num">{a.wasted}</td>
                </tr>
              ))}
              {plan.unassigned.map((u) => (
                <tr key={u.party.id}>
                  <td>{u.party.guestName ?? 'Party'}</td>
                  <td>{guests(u.party.partySize)}</td>
                  <td>{u.party.waitedMinutes} min</td>
                  <td colSpan={2} className="cell_sub">
                    {u.reason}
                  </td>
                </tr>
              ))}
              {plan.assignments.length === 0 && plan.unassigned.length === 0 && (
                <tr>
                  <td colSpan={5} className="cell_sub" style={{ padding: 'var(--s-6)', textAlign: 'center' }}>
                    Nobody is waiting right now.
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
