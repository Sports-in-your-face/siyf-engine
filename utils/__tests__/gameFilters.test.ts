import { describe, expect, it } from 'vitest';
import type { Game } from '../../types';
import { filterRecentGames, isGameWithinFeedWindow } from '../gameFilters';

function preGame(startTime: string): Game {
  return {
    id: '1',
    sport: 'FOOTBALL',
    status: 'Scheduled',
    statusState: 'pre',
    clock: '—',
    timing: { startTime, timezone: 'UTC', localStart: startTime, proofed: true },
    away: { name: 'Away', abbr: 'AWY', score: null },
    home: { name: 'Home', abbr: 'HME', score: null },
  };
}

describe('isGameWithinFeedWindow', () => {
  const now = new Date('2026-06-09T12:00:00Z');

  it('keeps upcoming scheduled games', () => {
    const game = preGame('2026-09-13T15:00:00Z');
    expect(isGameWithinFeedWindow(game, now)).toBe(true);
  });

  it('drops stale scheduled games far in the past', () => {
    const game = preGame('2020-09-13T15:00:00Z');
    expect(isGameWithinFeedWindow(game, now)).toBe(false);
  });

  it('allows recently missed tip-offs to remain briefly', () => {
    const game = preGame('2026-06-09T10:00:00Z');
    expect(isGameWithinFeedWindow(game, now)).toBe(true);
  });
});

describe('filterRecentGames', () => {
  it('filters a mixed schedule list', () => {
    const games = [
      preGame('2020-01-01T12:00:00Z'),
      preGame('2026-09-13T15:00:00Z'),
    ];
    const filtered = filterRecentGames(games, new Date('2026-06-09T12:00:00Z'));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].timing?.startTime).toBe('2026-09-13T15:00:00Z');
  });
});
