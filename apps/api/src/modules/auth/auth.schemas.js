import { z } from 'zod';

/**
 * The audit found a one-character password was accepted and that every field
 * was trusted straight off the wire. These schemas are the single place where
 * that is now decided.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .max(254, 'Email is too long');

/**
 * Length is the dominant factor in password strength, so the minimum is 10
 * rather than the usual 8, and the maximum exists because bcrypt silently
 * ignores input past 72 bytes — without this cap, two different long
 * passwords sharing a 72-byte prefix would be interchangeable at login.
 */
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(72, 'Password must be 72 characters or fewer')
  .refine((v) => /[a-z]/.test(v), 'Include at least one lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Include at least one uppercase letter')
  .refine((v) => /\d/.test(v), 'Include at least one number');

const username = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(60, 'Name must be 60 characters or fewer')
  // Blocks the control characters and angle brackets that made the legacy
  // stored-XSS possible. React escapes on render too — this is defence in
  // depth, not the only layer.
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u, 'Name contains invalid characters');

/** Indian mobile numbers: 10 digits starting 6-9, with optional +91 prefix. */
const phone = z
  .string()
  .trim()
  .regex(/^(?:\+?91[- ]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
  .transform((v) => v.replace(/\D/g, '').slice(-10));

export const registerSchema = z
  .object({
    username,
    email,
    phone: phone.optional(),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email,
  // Deliberately NOT the strict `password` schema. Validating an existing
  // password against current policy would leak which accounts predate the
  // rules, and would reject legitimate users with a confusing field error
  // instead of a clean "invalid credentials".
  password: z.string().min(1, 'Password is required').max(72),
});

export const updateProfileSchema = z.object({
  username: username.optional(),
  phone: phone.optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(72),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
