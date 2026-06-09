import { describe, expect, it } from 'vitest';
import type { Game } from '../../../types';
import {
  hasBlockingIssues,
  resolveLayoutForGame,
  validateFightLayout,
  validateGameForSport,
  validateLeaderboardLayout,
  validateMatchupLayout,
  validateTeamLayout,
} from '../invariants';
import { loadGoldenFixture, parseGoldenFixture } from '../fixtureTestUtils';

function teamGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    sport: 'BASKETBALL',
    status: 'Live',
    statusState: 'in',
    clock: 'Q1',
    away: { name: 'Away', abbr: 'AWY', score: 10 },
    home: { name: 'Home', abbr: 'HME', score: 12 },
    ...overrides,
  };
}

describe('resolveLayoutForGame', () => {
  it('maps engine sports and tour tags to layouts', () => {
    expect(resolveLayoutForGame({ sport: 'ATP' } as Game, 'TENNIS')).toBe('matchup');
    expect(resolveLayoutForGame({ sport: 'UFC' } as Game, 'FIGHTS')).toBe('fight');
    expect(resolveLayoutForGame({ sport: 'PGA' } as Game, 'GOLF')).toBe('leaderboard');
    expect(resolveLayoutForGame({ sport: 'WNBA' } as Game)).toBe('team');
    expect(resolveLayoutForGame({ sport: 'NBA' } as Game, 'BASKETBALL')).toBe('team');
  });
});

describe('layout validators', () => {
  it('team layout flags object scores', () => {
    const issues = validateTeamLayout(teamGame({
      away: { name: 'Cavs', abbr: 'CLE', score: { displayValue: '88' } as unknown as number },
    }));
    expect(issues.some((i) => i.code === 'team.score.object')).toBe(true);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it('matchup layout warns when tournament name is missing', () => {
    const issues = validateMatchupLayout(teamGame({
      sport: 'ATP',
      tournamentName: undefined,
    }));
    expect(issues.some((i) => i.code === 'matchup.tournament.missing')).toBe(true);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it('fight layout warns when UFC weight class is missing', () => {
    const issues = validateFightLayout(teamGame({
      sport: 'UFC',
      tournamentName: 'UFC 300',
      weightClass: undefined,
    }));
    expect(issues.some((i) => i.code === 'fight.weight_class.missing')).toBe(true);
  });

  it('leaderboard layout errors when leaderboard is missing', () => {
    const issues = validateLeaderboardLayout(teamGame({
      sport: 'PGA',
      tournamentName: 'Masters',
      home: { name: 'Field', abbr: 'FLD', score: null },
      leaderboard: undefined,
    }));
    expect(issues.some((i) => i.code === 'leaderboard.missing')).toBe(true);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it('leaderboard layout allows Field placeholder home team', () => {
    const issues = validateLeaderboardLayout(teamGame({
      sport: 'PGA',
      tournamentName: 'Masters',
      home: { name: 'Field', abbr: 'FLD', score: null },
      leaderboard: [{
        id: '1',
        name: 'Leader',
        position: 1,
        score: '210',
        toPar: '-6',
      }],
    }));
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('validateGameForSport on golden fixtures', () => {
  const cases = [
    { parser: 'tennis' as const, sport: 'TENNIS', file: 'tennis/atp-match.json' },
    { parser: 'golf' as const, sport: 'GOLF', file: 'golf/pga-tournament.json' },
    { parser: 'fight' as const, sport: 'FIGHTS', file: 'fights/ufc-bout-pre.json' },
    { parser: 'team' as const, sport: 'BASKETBALL', file: 'basketball/live-standard.json' },
  ];

  for (const entry of cases) {
    it(`passes ${entry.file} with layout-specific rules`, () => {
      const raw = loadGoldenFixture(entry.file);
      const games = parseGoldenFixture(entry.parser, entry.sport, raw);
      const issues = games.flatMap((game) => validateGameForSport(game, entry.sport));
      expect(hasBlockingIssues(issues), JSON.stringify(issues, null, 2)).toBe(false);
    });
  }
});
