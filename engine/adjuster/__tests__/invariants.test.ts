import { describe, expect, it } from 'vitest';
import type { Game } from '../../../types';
import { hasBlockingIssues, validateGame, validateGameForSport } from '../invariants';

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: '1',
    sport: 'NBA',
    status: 'Live',
    statusState: 'in',
    clock: 'Q1',
    away: { name: 'Away', abbr: 'AWY', score: 10 },
    home: { name: 'Home', abbr: 'HME', score: 12 },
    ...overrides,
  };
}

describe('validateGame', () => {
  it('passes a well-formed game', () => {
    expect(validateGame(baseGame())).toEqual([]);
  });

  it('flags raw object scores', () => {
    const issues = validateGame(baseGame({
      away: { name: 'Cavs', abbr: 'CLE', score: { displayValue: '88' } as unknown as number },
    }));
    expect(issues.some((i) => i.code === 'team.score.object')).toBe(true);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it('flags missing game id', () => {
    const issues = validateGame(baseGame({ id: '' }));
    expect(issues.some((i) => i.code === 'game.id.missing')).toBe(true);
  });

  it('routes team sport through validateGameForSport', () => {
    expect(validateGameForSport(baseGame(), 'BASKETBALL')).toEqual([]);
  });
});
