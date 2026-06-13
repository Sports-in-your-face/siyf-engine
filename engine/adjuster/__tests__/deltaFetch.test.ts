import { describe, expect, it } from 'vitest';
import type { Game } from '../../../types';
import { resetChronoState, updateGameChrono } from '../chronoState';
import { shouldSkipScoreboardEnrichment } from '../deltaFetch';

function game(id: string, partial: Partial<Game> = {}): Game {
  return {
    id,
    home: { name: 'H', abbr: 'H', score: 0 },
    away: { name: 'A', abbr: 'A', score: 0 },
    status: 'Live',
    clock: '4:32',
    statusState: 'in',
    ...partial,
  };
}

describe('deltaFetch', () => {
  it('skips enrichment when all live games are PRESENT_LIVE', () => {
    resetChronoState();
    const g1 = game('1');
    const g2 = game('2');
    updateGameChrono(g1);
    updateGameChrono(g2);
    expect(shouldSkipScoreboardEnrichment([g1, g2])).toBe(true);
  });

  it('does not skip when a game is committed paused', () => {
    resetChronoState();
    const live = game('1');
    const delayed = game('2', { status: 'Rain Delay', clock: '—' });
    updateGameChrono(live);
    updateGameChrono(delayed);
    updateGameChrono(delayed);
    expect(shouldSkipScoreboardEnrichment([live, delayed])).toBe(false);
  });
});
