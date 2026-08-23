import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext.jsx';
import { getVenue } from '../../data/venues.js';
import { BookingSheet } from './BookingSheet.jsx';

vi.mock('../../services/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: vi.fn(() => Promise.resolve()) };
});

vi.mock('../../lib/hooks.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useCountdown: () => 120 };
});

function renderSheet(venue) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <BookingSheet venue={venue} date="2026-09-12" open initialTime="20:00" onClose={() => {}} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('BookingSheet', () => {
  it('completes the happy-path booking and shows the confirmation', async () => {
    const user = userEvent.setup();
    const venue = getVenue('olive-and-grove');
    expect(venue).not.toBeNull();

    renderSheet(venue);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Aarav Sharma' } });
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '9876543210' } });
    await user.click(screen.getByRole('button', { name: /confirm booking/i }));

    await waitFor(() => {
      expect(screen.getByText(/you.?re booked/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Olive & Grove')).toBeInTheDocument();
    expect(screen.getByText(/SW-[A-Z0-9]+/)).toBeInTheDocument();
  });
});
