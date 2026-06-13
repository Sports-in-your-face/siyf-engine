import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Game } from '../../../types';
import { resetChronoState } from '../../engine/adjuster/chronoState';

const fetchGamesMock = vi.fn();

vi.mock('../api', () => ({
  SPORT_ENDPOINTS: { BASEBALL: '/mlb' },
  fetchGames: (...args: unknown[]) => fetchGamesMock(...args),
}));

import { fetchScoreboardOnce, resetScoreboardPoller } from '../scoreboardPoller';

function game(id: string, partial: Partial<Game> = {}): Game {
  return {
    id,
    home: { name: 'Home', abbr: 'HOM', score: 0 },
    away: { name: 'Away', abbr: 'AWY', score: 0 },
    status: 'Live',
    clock: '4:32',
    statusState: 'in',
    ...partial,
  };
}

describe('scoreboardPoller chrono integration', () => {
  beforeEach(() => {
    resetScoreboardPoller();
    resetChronoState();
    fetchGamesMock.mockReset();
  });

  it('triggers bypassCache refetch when game resumes from pause', async () => {
    const delayed = game('g1', { status: 'Rain Delay', clock: '—' });
    const resumed = game('g1', { status: 'Top 7th', clock: '4:32' });

    fetchGamesMock
      .mockResolvedValueOnce([delayed])
      .mockResolvedValueOnce([delayed])
      .mockResolvedValueOnce([resumed])
      .mockResolvedValueOnce([resumed]);

    await fetchScoreboardOnce('BASEBALL');
    await fetchScoreboardOnce('BASEBALL');
    await fetchScoreboardOnce('BASEBALL');

    await vi.waitFor(() => {
      expect(fetchGamesMock.mock.calls.some((c) => c[1]?.bypassCache === true)).toBe(true);
    });
  });

  it('coalesces 50 parallel fetchScoreboardOnce into one fetchGames call', async () => {
    fetchGamesMock.mockResolvedValue([game('g1')]);

    await Promise.all(
      Array.from({ length: 50 }, () => fetchScoreboardOnce('BASEBALL')),
    );

    expect(fetchGamesMock).toHaveBeenCalledTimes(1);
  });
});
