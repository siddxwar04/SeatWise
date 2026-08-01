import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ApiError } from '../lib/api.js';

/**
 * Registration.
 *
 * The legacy version accepted a one-character password (audit #8) and did no
 * server-side validation of anything (audit #9). The rules below mirror the
 * server's Zod schema exactly — shown live so people are not told what is
 * wrong only after submitting.
 */

const RULES = [
  { id: 'length', label: 'At least 10 characters', test: (v) => v.length >= 10 },
  { id: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'digit', label: 'One number', test: (v) => /\d/.test(v) },
];

export function RegisterPage() {
  const [form, setForm] = useState({
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const ruleState = useMemo(
    () => RULES.map((rule) => ({ ...rule, passed: rule.test(form.password) })),
    [form.password],
  );

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
      const payload = {
        username: form.username,
        email: form.email,
        password: form.password,
        confirmPassword: form.confirmPassword,
        ...(form.phone ? { phone: form.phone } : {}),
      };
      const user = await register(payload);
      toast.success(`Account created. Welcome, ${user.username.split(' ')[0]}.`);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details && typeof err.details === 'object') {
          setFieldErrors(err.details);
          toast.error('Please check the highlighted fields.');
        } else {
          toast.error(err.message);
        }
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
        <h2>Create Account</h2>
        <p className="auth_subtitle">Book faster and keep all your reservations in one place.</p>

        <div className="form_group">
          <label htmlFor="username">Full Name</label>
          <input
            id="username"
            type="text"
            name="username"
            value={form.username}
            onChange={update('username')}
            autoComplete="name"
            aria-invalid={Boolean(fieldErrors.username)}
            required
          />
          {fieldErrors.username && <p className="field_error">{fieldErrors.username}</p>}
        </div>

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
          <label htmlFor="phone">
            Mobile Number <span className="field_optional">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            name="phone"
            value={form.phone}
            onChange={update('phone')}
            autoComplete="tel"
            inputMode="numeric"
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          {fieldErrors.phone && <p className="field_error">{fieldErrors.phone}</p>}
        </div>

        <div className="form_group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby="password-rules"
            required
          />
          <ul className="password_rules" id="password-rules">
            {ruleState.map((rule) => (
              <li key={rule.id} className={rule.passed ? 'rule_passed' : 'rule_pending'}>
                <span aria-hidden="true">{rule.passed ? '✓' : '○'}</span> {rule.label}
              </li>
            ))}
          </ul>
          {fieldErrors.password && <p className="field_error">{fieldErrors.password}</p>}
        </div>

        <div className="form_group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            autoComplete="new-password"
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            required
          />
          {form.confirmPassword && form.password !== form.confirmPassword && (
            <p className="field_error">Passwords do not match</p>
          )}
          {fieldErrors.confirmPassword && (
            <p className="field_error">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <button type="submit" className="auth_btn" disabled={submitting}>
          {submitting ? 'CREATING ACCOUNT…' : 'SIGN UP'}
        </button>

        <p className="switch_link">
          Already have an account? <Link to="/login">Log In</Link>
        </p>
      </form>
    </div>
  );
}
