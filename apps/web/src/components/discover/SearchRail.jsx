import { PARTY_SIZES, SERVICE_TIMES } from '../../data/cities.js';
import { formatDateRelative, formatTime, todayISO } from '../../lib/format.js';
import { useDismiss } from '../../lib/hooks.js';
import { Icon } from '../ui/Icon.jsx';
import { useRef, useState } from 'react';

/**
 * The search rail: where / date / time / party in one visual object.
 *
 * OpenTable spreads these four inputs across the hero as separate controls —
 * they read as four unrelated decisions instead of one search. A single pill
 * with hairline dividers keeps the eye on one axis and makes it obvious the
 * four values compose into one query.
 */

const DATE_OPTIONS = Array.from({ length: 6 }, (_, i) => todayISO(i));

function Segment({ label, icon, value, children, wide = false }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  return (
    <div className={`rail_seg ${wide ? 'is-wide' : ''}`} ref={ref}>
      <button
        type="button"
        className={`rail_btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Icon name={icon} className="rail_icon" />
        <span className="rail_text">
          <span className="rail_label">{label}</span>
          <span className="rail_value">{value}</span>
        </span>
      </button>
      {open && children(() => setOpen(false))}
    </div>
  );
}

function Pop({ children }) {
  return (
    <div className="rail_pop" role="listbox">
      {children}
    </div>
  );
}

function PopOption({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={`rail_pop_item ${active ? 'is-on' : ''}`}
      onClick={onClick}
    >
      {children}
      {active && <Icon name="check" />}
    </button>
  );
}

export function SearchRail({ query, onChange }) {
  const areaRef = useRef(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const areaDismiss = useDismiss(areaOpen, () => setAreaOpen(false));

  const set = (patch) => onChange({ ...query, ...patch });

  return (
    <div className="rail">
      <div className="rail_seg is-wide" ref={areaDismiss}>
        <button
          type="button"
          className={`rail_btn ${areaOpen ? 'is-open' : ''}`}
          onClick={() => setAreaOpen((v) => !v)}
          aria-expanded={areaOpen}
        >
          <Icon name="search" className="rail_icon" />
          <span className="rail_text">
            <span className="rail_label">Where</span>
            <input
              ref={areaRef}
              className="rail_input"
              value={query.text}
              placeholder="Search restaurants, cuisines, areas"
              onChange={(e) => set({ text: e.target.value })}
              onFocus={() => setAreaOpen(true)}
            />
          </span>
        </button>
      </div>

      <span className="rail_div" />

      <Segment label="Date" icon="calendar" value={formatDateRelative(query.date)}>
        {(close) => (
          <Pop>
            {DATE_OPTIONS.map((date) => (
              <PopOption
                key={date}
                active={date === query.date}
                onClick={() => {
                  set({ date });
                  close();
                }}
              >
                {formatDateRelative(date)}
              </PopOption>
            ))}
          </Pop>
        )}
      </Segment>

      <span className="rail_div" />

      <Segment label="Time" icon="clock" value={formatTime(query.time)}>
        {(close) => (
          <Pop>
            {SERVICE_TIMES.map((time) => (
              <PopOption
                key={time}
                active={time === query.time}
                onClick={() => {
                  set({ time });
                  close();
                }}
              >
                {formatTime(time)}
              </PopOption>
            ))}
          </Pop>
        )}
      </Segment>

      <span className="rail_div" />

      <Segment
        label="Party"
        icon="users"
        value={`${query.party} guest${query.party === 1 ? '' : 's'}`}
      >
        {(close) => (
          <Pop>
            {PARTY_SIZES.map((n) => (
              <PopOption
                key={n}
                active={n === query.party}
                onClick={() => {
                  set({ party: n });
                  close();
                }}
              >
                {n} guest{n === 1 ? '' : 's'}
              </PopOption>
            ))}
          </Pop>
        )}
      </Segment>
    </div>
  );
}
