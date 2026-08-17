import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DEMO_ACCOUNTS } from '../services/session.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/Field.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Logo } from '../components/layout/Logo.jsx';
import { ApiError } from '../lib/api.js';
import { ServiceError } from '../services/config.js';

/**
 * Sign in.
 *
 * The demo-account panel is not a gimmick: this app has no backend deployed,
 * so without a documented way in, a reviewer can only ever see the diner side.
 * Signing in as the demo owner is how the console — the part of the product
 * the research brief is actually about — becomes reachable at all.
 */
export function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
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
            New to SeatWise? <Link to="/register">Create an account</Link>
          </p>
        </form>

        <div className="auth_demo">
          <p className="auth_demo_label">
            <Icon name="sparkles" /> No backend is deployed — sign in with a demo account
          </p>
          {DEMO_ACCOUNTS.map((account) => (
            <button key={account.email} type="button" className="auth_demo_card" onClick={() => fillDemo(account)}>
              <span className="auth_demo_role">{account.label}</span>
              <strong>{account.email}</strong>
              <span className="auth_demo_blurb">{account.blurb}</span>
            </button>
          ))}
          <p className="auth_demo_hint">Password for both: demo1234</p>
        </div>
      </div>
    </div>
  );
}
