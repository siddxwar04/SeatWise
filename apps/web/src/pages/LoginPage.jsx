import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ApiError } from '../lib/api.js';

/**
 * The login page finally gets the card it was always styled for.
 *
 * Audit #15: the form carried class="auth_form", which has no CSS rule
 * anywhere. Meanwhile `.auth_card` (style.css:654) and `.auth_body`
 * (style.css:639) were fully written and applied to nothing, so both auth
 * pages rendered full-width and unstyled — a jarring break from the polished
 * homepage. The rules were fine; they were simply never attached.
 */
export function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Send people back where they were headed before the login redirect.
  const destination = location.state?.from ?? '/';

  const update = (field) => (event) => {
    setForm((f) => ({ ...f, [field]: event.target.value }));
    setFieldErrors((errors) => ({ ...errors, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFieldErrors({});

    try {
      const user = await login(form);
      toast.success(`Welcome back, ${user.username.split(' ')[0]}.`);
      navigate(user.role === 'ADMIN' ? '/admin' : destination, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details && typeof err.details === 'object') setFieldErrors(err.details);
        // The server returns one message for "no such account" and "wrong
        // password" alike, so this cannot be used to discover which emails
        // are registered. The legacy app said "User not found!" and then
        // redirected to the register page, which gave it away twice over.
        toast.error(err.message);
      } else {
        toast.error('Could not reach the server. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth_wrapper container">
      <form className="auth_card" onSubmit={handleSubmit} noValidate>
        <h2>Welcome Back</h2>
        <p className="auth_subtitle">Sign in to manage your reservations.</p>

        <div className="form_group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            name="email"
            value={form.email}
            onChange={update('email')}
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.email)}
            required
          />
          {fieldErrors.email && <p className="field_error">{fieldErrors.email}</p>}
        </div>

        <div className="form_group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            value={form.password}
            onChange={update('password')}
            autoComplete="current-password"
            aria-invalid={Boolean(fieldErrors.password)}
            required
          />
          {fieldErrors.password && <p className="field_error">{fieldErrors.password}</p>}
        </div>

        <button type="submit" className="auth_btn" disabled={submitting}>
          {submitting ? 'SIGNING IN…' : 'LOG IN'}
        </button>

        <p className="switch_link">
          New here? <Link to="/register">Create Account</Link>
        </p>
      </form>
    </div>
  );
}
