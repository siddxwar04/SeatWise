import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/Field.jsx';
import { Logo } from '../components/layout/Logo.jsx';
import { ApiError } from '../lib/api.js';
import { ServiceError } from '../services/config.js';

export function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();
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
      const { user } = await register(form);
      toast.success(`Welcome, ${user.username.split(' ')[0]}. Your account is ready.`);
      navigate('/', { replace: true });
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

  return (
    <div className="auth_wrapper">
      <form className="auth_card auth_card-solo" onSubmit={submit} noValidate>
        <Logo showWord={false} size={36} />
        <h1>Create your account</h1>
        <p className="auth_sub">Book tables across every city on SeatWise.</p>

        <TextField
          label="Full name"
          value={form.username}
          onChange={update('username')}
          error={errors.username}
          autoComplete="name"
          required
        />
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
          hint="At least 8 characters."
          autoComplete="new-password"
          required
        />

        <Button type="submit" variant="primary" block loading={submitting}>
          Create account
        </Button>

        <p className="auth_switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
