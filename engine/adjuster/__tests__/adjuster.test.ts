import { describe, expect, it, beforeEach } from 'vitest';
import scoreObjectFixture from '../__fixtures__/basketball/score-object.json';
import scoreMovedFixture from '../__fixtures__/basketball/score-moved.json';
import { parseEventsForSport } from '../../../services/parsers/parseGameEvent';
import { recordParseBatch, buildDriftReport } from '../adjuster';
import { resetParseTelemetry } from '../telemetry';
import { validateGames } from '../invariants';

describe('Parse Adjuster integration', () => {
  beforeEach(() => {
    resetParseTelemetry();
  });

  it('parses object scores via field alias registry', () => {
    const games = parseEventsForSport([scoreObjectFixture], 'BASKETBALL');
    expect(games).toHaveLength(1);
    expect(games[0].away.score).toBe(88);
    expect(games[0].home.score).toBe(91);
    expect(validateGames(games)).toEqual([]);
  });

  it('recovers when ESPN moves score to scoring.displayValue', () => {
    const games = parseEventsForSport([scoreMovedFixture], 'BASKETBALL');
    expect(games).toHaveLength(1);
    expect(games[0].away.score).toBe(42);
    expect(games[0].home.score).toBe(39);
  });

  it('emits drift alert on low parse rate', () => {
    const report = recordParseBatch({
      sport: 'BASKETBALL',
      rawCount: 10,
      parsed: [],
      skipped: 10,
    });
    expect(report.healthy).toBe(false);
    expect(report.alerts.length).toBeGreaterThan(0);
    expect(report.metrics.parseRate).toBe(0);
  });

  it('buildDriftReport exports AI-reviewable JSON', () => {
    const report = recordParseBatch({
      sport: 'FOOTBALL',
      rawCount: 5,
      parsed: parseEventsForSport([scoreObjectFixture], 'BASKETBALL'),
      skipped: 0,
    });
    const json = buildDriftReport([report]);
    const parsed = JSON.parse(json);
    expect(parsed.summary).toHaveLength(1);
    expect(parsed.generatedAt).toBeTruthy();
  });
});
