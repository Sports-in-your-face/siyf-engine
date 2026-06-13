import { describe, expect, it, beforeEach } from 'vitest';
import type { Game } from '../../../types';
import {
  CHRONO_POLL_INTERVALS,
  computeChronoPollInterval,
  ENTER_CONFIRM_COUNT,
  getGameChronoRecord,
  resetChronoState,
  updateGameChrono,
  updateGamesChrono,
} from '../chronoState';

function game(partial: Partial<Game> & Pick<Game, 'id'>): Game {
  return {
    home: { name: 'Home', abbr: 'HOM', score: 0 },
    away: { name: 'Away', abbr: 'AWY', score: 0 },
    status: 'Live',
    clock: '4:32',
    statusState: 'in',
    ...partial,
  };
}

describe('chronoState', () => {
  beforeEach(() => resetChronoState());

  it('commits PRESENT_LIVE immediately for active clock', () => {
    updateGameChrono(game({ id: 'g1' }));
    expect(getGameChronoRecord('g1')?.committedState).toBe('PRESENT_LIVE');
  });

  it('requires two consecutive pause payloads before throttling', () => {
    const delayed = game({ id: 'g2', status: 'Rain Delay', clock: '—' });

    updateGameChrono(delayed);
    expect(getGameChronoRecord('g2')?.committedState).toBe('PRESENT_LIVE');
    expect(getGameChronoRecord('g2')?.pendingCount).toBe(1);

    updateGameChrono(delayed);
    expect(getGameChronoRecord('g2')?.committedState).toBe('PRESENT_PAUSED');
  });

  it('does not flap on alternating rain delay payloads', () => {
    const delayed = game({ id: 'g3', status: 'Rain Delay', clock: '—' });
    const cleared = game({ id: 'g3', status: 'In Progress', clock: '—' });

    updateGameChrono(delayed);
    updateGameChrono(cleared);
    updateGameChrono(delayed);
    updateGameChrono(cleared);

    expect(getGameChronoRecord('g3')?.committedState).toBe('PRESENT_LIVE');
    expect(getGameChronoRecord('g3')?.pendingCount).toBeLessThan(ENTER_CONFIRM_COUNT);
  });

  it('snaps back to live immediately on active clock after pause', () => {
    const delayed = game({ id: 'g4', status: 'Rain Delay', clock: '—' });
    updateGameChrono(delayed);
    updateGameChrono(delayed);
    expect(getGameChronoRecord('g4')?.committedState).toBe('PRESENT_PAUSED');

    const resumed = game({ id: 'g4', status: 'Top 7th', clock: '4:32' });
    const t = updateGameChrono(resumed);
    expect(getGameChronoRecord('g4')?.committedState).toBe('PRESENT_LIVE');
    expect(t?.resumed).toBe(true);
  });

  it('computes fastest poll interval across games', () => {
    const live = game({ id: 'live' });
    const delayed = game({ id: 'pause', status: 'Rain Delay', clock: '—' });
    updateGameChrono(live);
    updateGameChrono(delayed);
    updateGameChrono(delayed);

    const interval = computeChronoPollInterval([live, delayed]);
    expect(interval).toBe(CHRONO_POLL_INTERVALS.PRESENT_LIVE);
  });

  it('returns resume transitions from batch update', () => {
    const delayed = game({ id: 'g5', status: 'Rain Delay', clock: '—' });
    updateGameChrono(delayed);
    updateGameChrono(delayed);

    const transitions = updateGamesChrono([game({ id: 'g5', status: 'Q3', clock: '8:15' })]);
    expect(transitions.some((t) => t.resumed)).toBe(true);
  });
});
