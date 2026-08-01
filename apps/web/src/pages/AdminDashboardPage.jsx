import { useCallback, useEffect, useState } from 'react';
import { AdminMenuPanel } from '../components/AdminMenuPanel.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { adminApi, ApiError } from '../lib/api.js';

/**
 * Admin dashboard — audit finding #5: "staff cannot see, confirm, modify, or
 * cancel bookings", and #24: bookings were "unreadable except via phpMyAdmin".
 *
 * Charts are drawn with plain CSS bars rather than a charting library. Twelve
 * data points do not justify shipping Chart.js to every admin page load, and
 * the visual language matches the rest of the site for free.
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

export function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [today, setToday] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const toast = useToast();

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = { pageSize: 25 };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const [statsData, todayData, listData] = await Promise.all([
        adminApi.stats(30),
        adminApi.today(),
        adminApi.reservations(params),
      ]);

      setStats(statsData);
      setToday(todayData);
      setReservations(listData.reservations);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load the dashboard.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, toast]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const changeStatus = async (reservation, nextStatus) => {
    setBusyId(reservation.id);
    try {
      // The version travels with the request. If another manager changed this
      // booking since it was rendered, the server rejects it rather than
      // silently overwriting their decision.
      await adminApi.updateStatus(reservation.id, nextStatus, reservation.version);
      toast.success(`${reservation.reference} → ${nextStatus.toLowerCase()}`);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed.');
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
        <p>Service overview and booking management for the last 30 days.</p>
      </header>

      {loading && !stats && <p className="menu_state">Loading dashboard…</p>}

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
                      {(NEXT_ACTIONS[r.status] ?? []).length === 0 && (
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

      <AdminMenuPanel />
    </main>
  );
}
