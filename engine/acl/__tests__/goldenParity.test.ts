import { describe, expect, it } from 'vitest';
import { GOLDEN_FIXTURES } from '../../adjuster/fixtureManifest';
import { loadGoldenFixture, parseGoldenFixture } from '../../adjuster/fixtureTestUtils';
import { hasBlockingIssues, validateGames } from '../../adjuster/invariants';

describe('ACL golden fixture parity', () => {
  for (const entry of GOLDEN_FIXTURES.filter((e) => e.parser === 'team')) {
    it(`${entry.id} parses identically through ACL-backed parser`, () => {
      const raw = loadGoldenFixture(entry.file);
      const games = parseGoldenFixture(entry.parser, entry.sport, raw);
      expect(games.length).toBeGreaterThanOrEqual(entry.minGames);
      const issues = validateGames(games, entry.sport);
      expect(hasBlockingIssues(issues)).toBe(false);
    });
  }
});
