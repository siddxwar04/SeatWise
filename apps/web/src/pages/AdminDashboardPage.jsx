import { useCallback, useEffect, useState } from 'react';
import { AdminMenuPanel } from '../components/AdminMenuPanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { adminApi, ApiError, DEFAULT_RESTAURANT_SLUG, waitlistApi } from '../lib/api.js';

/**
 * Admin dashboard — audit finding #5: "staff cannot see, confirm, modify, or
 * cancel bookings", and #24: bookings were "unreadable except via phpMyAdmin".
 *
 * Charts are drawn with plain CSS bars rather than a charting library. Twelve
 * data points do not justify shipping Chart.js to every admin page load, and
 * the visual language matches the rest of the site for free.
 *
 * Restaurant scope comes from AuthContext.managedRestaurants (GET /restaurants/mine).
 * Global ADMIN sees every venue; venue managers see only theirs. Switching the
 * select reloads stats, today's service, reservations, and the menu panel.
 */

const NEXT_ACTIONS = {
  PENDING: [
    { status: 'CONFIRMED', label: 'Confirm', tone: 'primary' },
    { status: 'CANCELLED', label: 'Cancel', tone: 'quiet' },
  ],
  CONFIRMED: [
    { status: 'SEATED', label: 'Seat', tone: 'primary' },
    { status: 'NO_SHOW', label: 'No-show', tone: 'quiet' },
    { status: 'CANCELLED', label: 'Cancel', tone: 'quiet' },
  ],
  SEATED: [{ status: 'COMPLETED', label: 'Complete', tone: 'primary' }],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

function riskLabel(risk) {
  if (risk === null || risk === undefined) return null;
  if (risk >= 0.6) return { text: `${Math.round(risk * 100)}% no-show risk`, level: 'high' };
  if (risk >= 0.3) return { text: `${Math.round(risk * 100)}% risk`, level: 'medium' };
  return { text: `${Math.round(risk * 100)}% risk`, level: 'low' };
}

function pickInitialSlug(venues) {
  if (!venues.length) return DEFAULT_RESTAURANT_SLUG;
  const preferred = venues.find((v) => v.slug === DEFAULT_RESTAURANT_SLUG);
  return preferred?.slug ?? venues[0].slug;
}

export function AdminDashboardPage() {
  const { managedRestaurants, loading: authLoading } = useAuth();
  const [restaurantSlug, setRestaurantSlug] = useState('');
  const [stats, setStats] = useState(null);
  const [today, setToday] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [panel, setPanel] = useState('reservations');
  const [waitlist, setWaitlist] = useState([]);
  const toast = useToast();

  // Wait for /restaurants/mine before picking a slug. Otherwise a venue manager
  // briefly requests DEFAULT_RESTAURANT_SLUG (Koramangala) and gets a 403 toast
  // even when they only administer a different restaurant.
  useEffect(() => {
    if (authLoading) return;
    if (!managedRestaurants.length) {
      setRestaurantSlug('');
      setLoading(false);
      return;
    }
    setRestaurantSlug((current) => {
      if (current && managedRestaurants.some((v) => v.slug === current)) return current;
      return pickInitialSlug(managedRestaurants);
    });
  }, [managedRestaurants, authLoading]);

  const activeVenue = managedRestaurants.find((v) => v.slug === restaurantSlug);
  const showSwitcher = managedRestaurants.length > 1;

  const loadAll = useCallback(async () => {
    if (!restaurantSlug) return;
    setLoading(true);
    setLoadError(null);
    try {
      const params = { restaurant: restaurantSlug, pageSize: 25 };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const [statsData, todayData, listData, waitlistData] = await Promise.all([
        adminApi.stats(restaurantSlug, 30),
        adminApi.today(restaurantSlug),
        adminApi.reservations(params),
        waitlistApi.list(restaurantSlug),
      ]);

      setStats(statsData);
      setToday(todayData);
      setReservations(listData.reservations);
      setWaitlist(waitlistData.entries ?? []);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load the dashboard.';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [restaurantSlug, statusFilter, search, toast]);

  useEffect(() => {
    if (authLoading || !restaurantSlug) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, restaurantSlug, authLoading]);

  const changeStatus = async (reservation, nextStatus) => {
    setBusyId(reservation.id);
    try {
      // The version travels with the request. If another manager changed this
      // booking since it was rendered, the server rejects it rather than
      // silently overwriting their decision.
      await adminApi.updateStatus(reservation.id, nextStatus, reservation.version, restaurantSlug);
      toast.success(`${reservation.reference} → ${nextStatus.toLowerCase()}`);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const sendReminder = async (reservation) => {
    setBusyId(reservation.id);
    try {
      const result = await adminApi.sendReminder(reservation.id, restaurantSlug);
      toast.success(result.message || 'Reminder sent.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send reminder.');
    } finally {
      setBusyId(null);
    }
  };

  const maxWeekday = Math.max(1, ...(stats?.bookingsByWeekday.map((d) => d.count) ?? [1]));

  return (
    <main className="page_wrapper container">
      <header className="page_header">
        <span className="tag">Staff</span>
        <h1>Dashboard</h1>
        <p>
          {activeVenue
            ? `Service overview and booking management for ${activeVenue.name}.`
            : 'Service overview and booking management for the last 30 days.'}
        </p>
      </header>

      {!authLoading && managedRestaurants.length === 0 && (
        <p className="menu_state menu_state_error">
          Your account is not assigned to a restaurant. Ask a platform admin for access.
        </p>
      )}

      {showSwitcher && (
        <div className="restaurant_switcher">
          <label htmlFor="admin-restaurant">Restaurant</label>
          <select
            id="admin-restaurant"
            value={restaurantSlug}
            onChange={(e) => {
              setStats(null);
              setRestaurantSlug(e.target.value);
            }}
          >
            {managedRestaurants.map((venue) => (
              <option key={venue.id} value={venue.slug}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!showSwitcher && activeVenue && <p className="restaurant_badge">{activeVenue.name}</p>}

      {loading && !stats && <p className="menu_state">Loading dashboard…</p>}

      {loadError && (
        <p className="menu_state menu_state_error" role="alert">
          {loadError}{' '}
          <button type="button" className="btn btn-login btn-small" onClick={loadAll}>
            Retry
          </button>
        </p>
      )}

      {stats && (
        <>
          <section className="stat_grid" aria-label="Key metrics">
            <div className="stat_card">
              <p className="stat_value">{today?.bookings ?? 0}</p>
              <p className="stat_label">Bookings today</p>
            </div>
            <div className="stat_card">
              <p className="stat_value">{today?.covers ?? 0}</p>
              <p className="stat_label">Covers today</p>
            </div>
            <div className="stat_card">
              <p className="stat_value">{stats.upcoming}</p>
              <p className="stat_label">Upcoming</p>
            </div>
            <div className="stat_card">
              <p className="stat_value">
                {stats.noShowRate === null ? '—' : `${stats.noShowRate}%`}
              </p>
              <p className="stat_label">No-show rate</p>
            </div>
            <div className="stat_card">
              <p className="stat_value">{stats.totals.averagePartySize}</p>
              <p className="stat_label">Avg party size</p>
            </div>
            <div className="stat_card">
              <p className="stat_value">{stats.totals.covers}</p>
              <p className="stat_label">Covers (30d)</p>
            </div>
          </section>

          <section className="chart_panel" aria-label="Bookings by weekday">
            <h2>Bookings by day of week</h2>
            <div className="bar_chart">
              {stats.bookingsByWeekday.map((day) => (
                <div className="bar_column" key={day.day}>
                  <div
                    className="bar_fill"
                    style={{ height: `${(day.count / maxWeekday) * 100}%` }}
                    title={`${day.count} bookings`}
                  />
                  <span className="bar_value">{day.count}</span>
                  <span className="bar_label">{day.day}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <div className="admin_toolbar" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={panel === 'reservations' ? 'btn btn-primary btn-small' : 'btn btn-login btn-small'}
          onClick={() => setPanel('reservations')}
        >
          Reservations
        </button>
        <button
          type="button"
          className={panel === 'waitlist' ? 'btn btn-primary btn-small' : 'btn btn-login btn-small'}
          onClick={() => setPanel('waitlist')}
        >
          Waitlist{waitlist.length ? ` (${waitlist.length})` : ''}
        </button>
      </div>

      {panel === 'reservations' && (
        <section className="admin_panel">
          <div className="admin_toolbar">
            <h2>Reservations</h2>
            <form
              className="admin_search"
              onSubmit={(e) => {
                e.preventDefault();
                loadAll();
              }}
            >
              <label htmlFor="admin-search" className="visually_hidden">
                Search by reference, name or phone
              </label>
              <input
                id="admin-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Reference, name or phone"
              />
              <label htmlFor="admin-status" className="visually_hidden">
                Filter by status
              </label>
              <select
                id="admin-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                {Object.keys(NEXT_ACTIONS).map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary btn-small">
                Search
              </button>
            </form>
          </div>

          <div className="table_scroll">
            <table className="admin_table">
              <caption className="visually_hidden">
                Reservations, most recent first, with status actions
              </caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Guest</th>
                  <th scope="col">When</th>
                  <th scope="col">Party</th>
                  <th scope="col">Table</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => {
                  const risk = riskLabel(r.noShowRisk);
                  const highRisk = risk?.level === 'high';
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.reference}</td>
                      <td>
                        {r.guestName}
                        <br />
                        <span className="cell_sub">{r.guestPhone}</span>
                        {r.account?.priorNoShows > 0 && (
                          <span className="flag_warning">
                            {r.account.priorNoShows} prior no-show
                            {r.account.priorNoShows === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                      <td>
                        {r.date}
                        <br />
                        <span className="cell_sub">{r.time}</span>
                      </td>
                      <td>{r.partySize}</td>
                      <td>{r.table?.label ?? '—'}</td>
                      <td>
                        <span className={`status_pill status_${r.status.toLowerCase()}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                        {risk && <span className={`risk_pill risk_${risk.level}`}>{risk.text}</span>}
                        {r.isOverbooked && <span className="risk_pill risk_medium">overbooked</span>}
                      </td>
                      <td className="action_cell">
                        {(NEXT_ACTIONS[r.status] ?? []).map((action) => (
                          <button
                            key={action.status}
                            type="button"
                            className={
                              action.tone === 'primary'
                                ? 'btn btn-primary btn-small'
                                : 'btn btn-login btn-small'
                            }
                            disabled={busyId === r.id}
                            onClick={() => changeStatus(r, action.status)}
                          >
                            {action.label}
                          </button>
                        ))}
                        {highRisk && ['PENDING', 'CONFIRMED'].includes(r.status) && (
                          <button
                            type="button"
                            className="btn btn-login btn-small"
                            disabled={busyId === r.id}
                            onClick={() => sendReminder(r)}
                          >
                            Send reminder
                          </button>
                        )}
                        {(NEXT_ACTIONS[r.status] ?? []).length === 0 && !highRisk && (
                          <span className="cell_sub">No actions</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {reservations.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="cell_empty">
                      No reservations match that filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {panel === 'waitlist' && (
        <section className="admin_panel">
          <div className="admin_toolbar">
            <h2>Waitlist</h2>
            <button type="button" className="btn btn-login btn-small" onClick={loadAll}>
              Refresh
            </button>
          </div>
          <div className="table_scroll">
            <table className="admin_table">
              <caption className="visually_hidden">Current waitlist entries</caption>
              <thead>
                <tr>
                  <th scope="col">Guest</th>
                  <th scope="col">When</th>
                  <th scope="col">Party</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.guestName}
                      <br />
                      <span className="cell_sub">{entry.guestPhone}</span>
                      {entry.guestEmail && (
                        <>
                          <br />
                          <span className="cell_sub">{entry.guestEmail}</span>
                        </>
                      )}
                    </td>
                    <td>
                      {entry.date}
                      <br />
                      <span className="cell_sub">{entry.time}</span>
                    </td>
                    <td>{entry.partySize}</td>
                    <td>
                      <span className={`status_pill status_${entry.status.toLowerCase()}`}>
                        {entry.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="cell_sub">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
                {waitlist.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="cell_empty">
                      No one is on the waitlist right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <AdminMenuPanel restaurantSlug={restaurantSlug} />
    </main>
  );
}
