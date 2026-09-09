import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../services/session.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/Field.jsx';
import { Logo } from '../components/layout/Logo.jsx';
import { ApiError } from '../lib/api.js';
import { ServiceError } from '../services/config.js';

/**
 * "Forgot password" — always resolves to the same message whether or not the
 * account exists, matching login's enumeration defence. In dev/demo (no
 * RESEND_API_KEY configured), the API includes the reset link directly in the
 * response so this still works without a mail provider.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState(null);
  const toast = useToast();

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const result = await forgotPassword(email.trim());
      setSent(true);
      setDevResetUrl(result?.resetUrl ?? null);
    } catch (err) {
      if (err instanceof ServiceError || err instanceof ApiError) {
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
        <h1>Reset your password</h1>
        <p className="auth_sub">
          Enter the email on your account and we will send you a link to reset it.
        </p>

        {sent ? (
          <div className="stack">
            <p className="note note-brand">
              If that email exists, a reset link is on its way. Check your inbox.
            </p>
            {devResetUrl && (
              <div className="note note-warn">
                <p>
                  Email sending is not configured on this deployment. Use this link directly:
                </p>
                <p>
                  <Link to={devResetUrl.replace(window.location.origin, '')}>{devResetUrl}</Link>
                </p>
              </div>
            )}
          </div>
        ) : (
          <TextField
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        )}

        {!sent && (
          <Button type="submit" variant="primary" block loading={submitting}>
            Send reset link
          </Button>
        )}

        <p className="auth_switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
