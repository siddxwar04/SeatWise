import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/session.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/Field.jsx';
import { Logo } from '../components/layout/Logo.jsx';
import { ApiError } from '../lib/api.js';
import { ServiceError } from '../services/config.js';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const toast = useToast();
  const navigate = useNavigate();

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
      await resetPassword({ token, ...form });
      toast.success('Password updated. Please sign in.');
      navigate('/login', { replace: true });
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

  if (!token) {
    return (
      <div className="auth_wrapper">
        <div className="auth_card auth_card-solo">
          <Logo showWord={false} size={36} />
          <h1>Reset link missing</h1>
          <p className="auth_sub">
            This page needs a reset token from the email link. Request a new one below.
          </p>
          <Button variant="primary" block to="/forgot-password">
            Request a reset link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth_wrapper">
      <form className="auth_card auth_card-solo" onSubmit={submit} noValidate>
        <Logo showWord={false} size={36} />
        <h1>Choose a new password</h1>
        <p className="auth_sub">Make it something you have not used here before.</p>

        <TextField
          label="New password"
          type="password"
          value={form.newPassword}
          onChange={update('newPassword')}
          error={errors.newPassword}
          hint="At least 10 characters, with upper, lower and a number."
          autoComplete="new-password"
          required
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          error={errors.confirmPassword}
          autoComplete="new-password"
          required
        />

        <Button type="submit" variant="primary" block loading={submitting}>
          Update password
        </Button>

        <p className="auth_switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
