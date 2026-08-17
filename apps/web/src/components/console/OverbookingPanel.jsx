import { formatTime, percent, rupees } from '../../lib/format.js';
import { Icon } from '../ui/Icon.jsx';

/**
 * The overbooking recommendation, shown against the naive `floor(Σp)` answer
 * it replaces — the gap between the two columns *is* the feature. See
 * lib/overbooking.js for the Poisson-binomial math behind both numbers.
 */
export function OverbookingPanel({ plan }) {
  return (
    <div className="stack">
      {plan.highlights.length > 0 && (
        <div className="note note-brand">
          <Icon name="sparkles" />
          <span>
            Tonight the model recommends selling {plan.recoverableCovers} more covers than the room
            technically holds, worth roughly {rupees(plan.recoverablePaise)} if they show — while
            keeping the chance of turning a real party away under 5%.
          </span>
        </div>
      )}

      <div className="panel">
        <div className="panel_head">
          <div>
            <h2>Overbooking by slot</h2>
            <p>Airline-style expected value, not a flat percentage</p>
          </div>
        </div>

        <div className="table_scroll">
          <table className="data_table">
            <caption className="sr-only">Per-slot overbooking recommendation vs the naive estimate</caption>
            <thead>
              <tr>
                <th>Slot</th>
                <th>Booked</th>
                <th>Capacity</th>
                <th>Expected no-shows</th>
                <th>Naive extra</th>
                <th>Recommended extra</th>
                <th>P(turn away)</th>
              </tr>
            </thead>
            <tbody>
              {plan.slots.map((slot) => (
                <tr key={slot.time}>
                  <td className="num">{formatTime(slot.time)}</td>
                  <td className="num">{slot.bookedCovers}</td>
                  <td className="num">{slot.capacityCovers}</td>
                  <td className="num">{slot.expectedNoShows.toFixed(1)}</td>
                  <td className="num">
                    {slot.naiveExtra}
                    {slot.isNaiveUnsafe && (
                      <span className="risk_pill risk-high" style={{ marginLeft: 6 }}>
                        unsafe
                      </span>
                    )}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {slot.recommendedExtra}
                  </td>
                  <td className="num">
                    {slot.recommendedExtra === 0
                      ? '—'
                      : percent(
                          slot.options.find((o) => o.extra === slot.recommendedExtra)?.overflowProbability ?? 0,
                          1,
                        )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note">
        <Icon name="info" />
        <span>
          "Naive" is floor(Σ no-show probability) — the number a spreadsheet gives you. It ignores
          variance: two bookings each with a 40% chance of no-showing have a 36% chance that
          <em> neither</em> no-shows, so accepting one extra booking on that basis is a real risk of
          turning a paying party away. The recommended figure accounts for that directly.
        </span>
      </div>
    </div>
  );
}
