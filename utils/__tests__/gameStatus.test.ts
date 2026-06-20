import { describe, expect, it } from 'vitest';
import type { Game } from '../../types';
import {
  isPlayoffSeriesDecided,
  isVoidEspnStatus,
  isVoidGame,
  shouldHideFromScoreboard,
  winsToClinchSeries,
} from '../gameStatus';

function hockeyGame(overrides: Partial<Game> = {}): Game {
  return {
    id: '1',
    sport: 'HOCKEY',
    status: 'Scheduled',
    statusState: 'pre',
    clock: '—',
    timing: { startTime: '2026-06-17T22:00:00Z', timezone: 'UTC', localStart: '6:00 PM', proofed: true },
    away: { name: 'Vegas Golden Knights', abbr: 'VGK', score: null },
    home: { name: 'Carolina Hurricanes', abbr: 'CAR', score: null },
    ...overrides,
  };
}

describe('winsToClinchSeries', () => {
  it('needs 4 wins in a best-of-7', () => {
    expect(winsToClinchSeries(7)).toBe(4);
    expect(winsToClinchSeries(5)).toBe(3);
  });
});

describe('isVoidEspnStatus', () => {
  it('detects ESPN cancelled type names', () => {
    expect(isVoidEspnStatus({ typeName: 'STATUS_CANCELED' })).toBe(true);
    expect(isVoidEspnStatus({ typeName: 'STATUS_POSTPONED' })).toBe(true);
  });

  it('detects cancelled short detail while still marked pre', () => {
    expect(isVoidEspnStatus({ shortDetail: 'Cancelled' })).toBe(true);
    expect(isVoidEspnStatus({ detail: 'Postponed due to weather' })).toBe(true);
  });
});

describe('isPlayoffSeriesDecided', () => {
  it('detects clinched best-of-7 from series wins', () => {
    const game = hockeyGame({
      context: {
        phase: 'playoffs',
        priority: 700,
        seriesLength: 7,
        awaySeriesWins: 2,
        homeSeriesWins: 4,
      },
    });
    expect(isPlayoffSeriesDecided(game)).toBe(true);
  });

  it('detects clinched series from competitor records', () => {
    const game = hockeyGame({
      context: {
        phase: 'finals',
        priority: 1000,
        awaySeriesRecord: '2-4',
        homeSeriesRecord: '4-2',
      },
    });
    expect(isPlayoffSeriesDecided(game)).toBe(true);
  });

  it('ignores regular-season games', () => {
    const game = hockeyGame({
      context: { phase: 'regular', priority: 100, awaySeriesWins: 4, homeSeriesWins: 0 },
    });
    expect(isPlayoffSeriesDecided(game)).toBe(false);
  });
});

describe('shouldHideFromScoreboard', () => {
  it('hides cancelled games', () => {
    const game = hockeyGame({ status: 'Cancelled', statusState: 'post' });
    expect(isVoidGame(game)).toBe(true);
    expect(shouldHideFromScoreboard(game)).toBe(true);
  });

  it('hides unplayed games after a series is decided', () => {
    const game = hockeyGame({
      status: 'Scheduled',
      context: {
        phase: 'playoffs',
        priority: 700,
        seriesLength: 7,
        awaySeriesWins: 1,
        homeSeriesWins: 4,
        seriesSummary: 'CAR leads 4-1',
      },
    });
    expect(shouldHideFromScoreboard(game)).toBe(true);
  });

  it('keeps live upcoming playoff games', () => {
    const game = hockeyGame({
      context: {
        phase: 'playoffs',
        priority: 700,
        seriesLength: 7,
        awaySeriesWins: 3,
        homeSeriesWins: 3,
      },
    });
    expect(shouldHideFromScoreboard(game)).toBe(false);
  });
});
