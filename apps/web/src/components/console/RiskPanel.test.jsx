import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RiskPanel } from './RiskPanel.jsx';

const queue = {
  bands: [
    { band: 'high', count: 1, covers: 2 },
    { band: 'medium', count: 1, covers: 4 },
    { band: 'low', count: 0, covers: 0 },
  ],
  queue: [
    {
      reference: 'SW-HIGH01',
      time: '20:00',
      guestName: 'Rahul Mehta',
      leadTimeDays: 90,
      partySize: 2,
      action: 'call',
      exposurePaise: 280000,
      risk: {
        probability: 0.72,
        band: 'high',
        drivers: [{ label: 'Booked 90 days ahead' }],
      },
    },
    {
      reference: 'SW-MED01',
      time: '19:30',
      guestName: 'Neha Iyer',
      leadTimeDays: 4,
      partySize: 4,
      action: 'remind',
      exposurePaise: 120000,
      risk: {
        probability: 0.31,
        band: 'medium',
        drivers: [{ label: 'Unconfirmed' }],
      },
    },
  ],
};

describe('RiskPanel', () => {
  it('renders the ranked queue with reasons and host actions', () => {
    render(<RiskPanel queue={queue} />);

    expect(screen.getByText('Risk queue')).toBeInTheDocument();
    expect(screen.getAllByText('High risk').length).toBeGreaterThan(0);
    expect(screen.getByText('Rahul Mehta')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('Booked 90 days ahead')).toBeInTheDocument();
    expect(screen.getByText('Call to confirm')).toBeInTheDocument();
    expect(screen.getByText('Neha Iyer')).toBeInTheDocument();
    expect(screen.getByText('Send reminder')).toBeInTheDocument();

    const names = screen.getAllByText(/Rahul Mehta|Neha Iyer/).map((el) => el.textContent);
    expect(names[0]).toContain('Rahul Mehta');
  });

  it('shows an empty state when nothing is open', () => {
    render(
      <RiskPanel
        queue={{
          bands: [
            { band: 'high', count: 0, covers: 0 },
            { band: 'medium', count: 0, covers: 0 },
            { band: 'low', count: 0, covers: 0 },
          ],
          queue: [],
        }}
      />,
    );

    expect(screen.getByText(/no open bookings to score right now/i)).toBeInTheDocument();
  });
});
