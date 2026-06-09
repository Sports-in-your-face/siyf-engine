import { describe, expect, it, beforeEach } from 'vitest';
import { GOLDEN_FIXTURES } from '../fixtureManifest';
import { loadGoldenFixture, parseGoldenFixture } from '../fixtureTestUtils';
import { hasBlockingIssues, validateGames } from '../invariants';
import { recordParseBatch } from '../adjuster';
import { resetParseTelemetry } from '../telemetry';

describe('golden fixtures corpus', () => {
  beforeEach(() => {
    resetParseTelemetry();
  });

  it('manifest references real fixture files', () => {
    for (const entry of GOLDEN_FIXTURES) {
      expect(loadGoldenFixture(entry.file), entry.id).toBeTruthy();
    }
    expect(GOLDEN_FIXTURES.length).toBeGreaterThanOrEqual(13);
  });

  for (const entry of GOLDEN_FIXTURES) {
    it(`parses ${entry.id} without invariant errors`, () => {
      const raw = loadGoldenFixture(entry.file);
      const games = parseGoldenFixture(entry.parser, entry.sport, raw);

      expect(games.length).toBeGreaterThanOrEqual(entry.minGames);

      if (entry.expectedGameSport) {
        expect(games[0].sport).toBe(entry.expectedGameSport);
      }

      const issues = validateGames(games, entry.sport);
      const blocking = issues.filter((i) => i.severity === 'error');
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);

      const report = recordParseBatch({
        sport: entry.sport,
        rawCount: 1,
        parsed: games,
        skipped: 0,
      });

      expect(report.healthy).toBe(true);
      expect(hasBlockingIssues(issues)).toBe(false);
    });
  }
});
