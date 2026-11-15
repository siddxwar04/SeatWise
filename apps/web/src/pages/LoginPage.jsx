import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DEMO_ACCOUNTS, demoAvailable } from '../services/session.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/Field.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Logo } from '../components/layout/Logo.jsx';
import { ApiError } from '../lib/api.js';
import { LIVE_API, ServiceError } from '../services/config.js';

/**
 * Sign in.
 *
 * The demo-account panel is not a gimmick: this app has no backend deployed,
 * so without a documented way in, a reviewer can only ever see the diner side.
 * Signing in as the demo owner is how the console — the part of the product
 * the research brief is actually about — becomes reachable at all.
 */
const LIVE_DEMO_ROLES = [
  {
    role: 'diner',
    label: 'Diner',
    action: 'Try as a diner',
    blurb: 'Search, book a table, see your bookings',
  },
  {
    role: 'owner',
    label: 'Restaurant owner',
    action: 'Try as an owner',
    blurb: 'Tonight’s book, risk queue, overbooking, floor',
  },
];

export function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { login, demoLogin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const destination = location.state?.from ?? '/';

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setErrors({});

    try {
      const { user, managedVenues } = await login(form);
      toast.success(`Welcome back, ${user.username.split(' ')[0]}.`);
      navigate(managedVenues.length > 0 ? '/console' : destination, { replace: true });
    } catch (err) {
      if (err instanceof ServiceError || err instanceof ApiError) {
        if (err.details) setErrors(err.details);
        toast.error(err.message);
      } else {
        toast.error('Could not reach the server. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (account) => {
    setForm({ email: account.email, password: account.password });
  };

  // Live mode: real one-click accounts, if the API has them switched on.
  const [liveDemo, setLiveDemo] = useState(false);
  const [demoBusy, setDemoBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    demoAvailable().then((enabled) => {
      if (!cancelled) setLiveDemo(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tryDemo = async (role) => {
    if (demoBusy) return;
    setDemoBusy(role);
    try {
      const { user } = await demoLogin(role);
      toast.success(`Signed in as ${user.username}.`);
      navigate(role === 'owner' ? '/console' : destination, { replace: true });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not start the demo. Please try again.',
      );
    } finally {
      setDemoBusy(null);
    }
  };

  return (
    <div className="auth_wrapper">
      <div className="auth_split">
        <form className="auth_card" onSubmit={submit} noValidate>
          <Logo showWord={false} size={36} />
          <h1>Welcome back</h1>
          <p className="auth_sub">Sign in to book, or to manage a restaurant.</p>

          <TextField
            label="Email address"
            type="email"
            value={form.email}
            onChange={update('email')}
            error={errors.email}
            autoComplete="email"
            required
          />
          <TextField
            label="Password"
            type="password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
            autoComplete="current-password"
            required
          />

          <Button type="submit" variant="primary" block loading={submitting}>
            Sign in
          </Button>

          <p className="auth_switch">
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          <p className="auth_switch">
            New to SeatWise? <Link to="/register">Create an account</Link>
          </p>
        </form>

        {LIVE_API && liveDemo && (
          <div className="auth_demo">
            <p className="auth_demo_label">
              <Icon name="sparkles" /> Just looking? Try it without an account
            </p>
            {LIVE_DEMO_ROLES.map((demo) => (
              <button
                key={demo.role}
                type="button"
                className="auth_demo_card"
                onClick={() => tryDemo(demo.role)}
                disabled={demoBusy !== null}
              >
                <span className="auth_demo_role">{demo.label}</span>
                <strong>{demoBusy === demo.role ? 'Signing in…' : demo.action}</strong>
                <span className="auth_demo_blurb">{demo.blurb}</span>
              </button>
            ))}
            <p className="auth_demo_hint">
              Shared demo accounts on sample data. Book as the diner at Forno Nove, then open the
              owner view to see it arrive.
            </p>
          </div>
        )}

        {/* Fixture accounts only exist in the local demo session; against the
            real API they would just return 401. */}
        {!LIVE_API && (
          <div className="auth_demo">
            <p className="auth_demo_label">
              <Icon name="sparkles" /> No backend is deployed — sign in with a demo account
            </p>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="auth_demo_card"
                onClick={() => fillDemo(account)}
              >
                <span className="auth_demo_role">{account.label}</span>
                <strong>{account.email}</strong>
                <span className="auth_demo_blurb">{account.blurb}</span>
              </button>
            ))}
            <p className="auth_demo_hint">Password for both: demo1234</p>
          </div>
        )}
      </div>
    </div>
  );
}
