import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let client;

function getClient() {
  if (!env.RESEND_API_KEY?.trim()) return null;
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

/**
 * Fire-and-forget email via Resend. Never throws — callers must not fail
 * booking/dashboard flows because mail delivery failed.
 */
export async function sendEmail(to, subject, html) {
  if (!to) {
    logger.warn({ subject }, 'email skipped — no recipient');
    return { ok: false, reason: 'no_recipient' };
  }

  const resend = getClient();
  if (!resend) {
    logger.warn({ to, subject }, 'email skipped — RESEND_API_KEY not set');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const from = env.MAIL_FROM || 'TastyFood <onboarding@resend.dev>';
    const result = await resend.emails.send({ from, to, subject, html });
    if (result.error) {
      logger.error({ err: result.error, to, subject }, 'resend API error');
      return { ok: false, reason: 'api_error' };
    }
    logger.info({ to, subject, id: result.data?.id }, 'email sent');
    return { ok: true, id: result.data?.id };
  } catch (err) {
    logger.error({ err, to, subject }, 'email send failed');
    return { ok: false, reason: 'exception' };
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function layout(title, body) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1c1917;line-height:1.5;padding:24px;background:#faf7f2">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #ebe3d9">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#e85d04;font-weight:700">TastyFood</p>
    <h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>
    ${body}
    <p style="margin:24px 0 0;font-size:12px;color:#8a7b6e">Questions? Reply to this email or call the restaurant.</p>
  </div></body></html>`;
}

export async function sendBookingConfirmation({
  to,
  guestName,
  restaurantName,
  date,
  time,
  partySize,
  reference,
}) {
  const html = layout(
    'You are booked',
    `<p>Hi ${escapeHtml(guestName)},</p>
     <p>Your table at <strong>${escapeHtml(restaurantName)}</strong> is confirmed.</p>
     <ul>
       <li><strong>When:</strong> ${escapeHtml(date)} at ${escapeHtml(time)}</li>
       <li><strong>Party:</strong> ${escapeHtml(partySize)}</li>
       <li><strong>Reference:</strong> ${escapeHtml(reference)}</li>
     </ul>
     <p>We look forward to hosting you.</p>`,
  );
  return sendEmail(to, `Booking confirmed — ${restaurantName}`, html);
}

export async function sendHighRiskReminder({
  to,
  guestName,
  restaurantName,
  date,
  time,
  partySize,
  reference,
}) {
  const html = layout(
    'Quick reminder about your booking',
    `<p>Hi ${escapeHtml(guestName)},</p>
     <p>This is a friendly reminder for your upcoming table at <strong>${escapeHtml(restaurantName)}</strong>.</p>
     <ul>
       <li><strong>When:</strong> ${escapeHtml(date)} at ${escapeHtml(time)}</li>
       <li><strong>Party:</strong> ${escapeHtml(partySize)}</li>
       <li><strong>Reference:</strong> ${escapeHtml(reference)}</li>
     </ul>
     <p>If your plans changed, please cancel so we can offer the table to someone on the waitlist.</p>`,
  );
  return sendEmail(to, `Reminder — ${restaurantName} on ${date}`, html);
}

export async function sendWaitlistAvailable({
  to,
  guestName,
  restaurantName,
  restaurantSlug,
  date,
  time,
  partySize,
  bookUrl,
}) {
  const url =
    bookUrl ||
    `${env.WEB_ORIGIN}/?restaurant=${encodeURIComponent(restaurantSlug)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}#reserve`;
  const html = layout(
    'A table just opened up',
    `<p>Hi ${escapeHtml(guestName)},</p>
     <p>Good news — a table for ${escapeHtml(partySize)} at <strong>${escapeHtml(restaurantName)}</strong> is available for <strong>${escapeHtml(date)} at ${escapeHtml(time)}</strong>.</p>
     <p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#e85d04;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">Book this table</a></p>
     <p>This offer may go quickly — book soon to secure it.</p>`,
  );
  return sendEmail(to, `Table available at ${restaurantName}`, html);
}
