import { beforeEach, describe, expect, it } from 'vitest';
import { loadGoldenFixture } from '../fixtureTestUtils';
import {
  parseActionNetworkSource,
  parseEspnSource,
  parseNcaaSource,
  parseWnbaEspnSource,
} from '../liveSmoke/parseSource';
import { evaluateParseBatch } from '../liveSmoke/evaluateBatch';
import {
  ACTION_NETWORK_SMOKE_SOURCES,
  ALL_SOURCE_SMOKE_IDS,
  ESPN_SMOKE_SOURCES,
  SUPPLEMENTAL_SMOKE_SOURCES,
} from '../liveSmoke/sourceRegistry';
import { hasBlockingIssues } from '../invariants';
import { resetParseTelemetry } from '../telemetry';

describe('source smoke simulation (offline)', () => {
  beforeEach(() => resetParseTelemetry());

  it('registry covers ESPN, Action Network, and supplemental sources', () => {
    expect(ESPN_SMOKE_SOURCES).toHaveLength(8);
    expect(ACTION_NETWORK_SMOKE_SOURCES).toHaveLength(4);
    expect(SUPPLEMENTAL_SMOKE_SOURCES).toHaveLength(2);
    expect(ALL_SOURCE_SMOKE_IDS.length).toBe(14);
    expect(ALL_SOURCE_SMOKE_IDS).toContain('action-network-nba');
    expect(ALL_SOURCE_SMOKE_IDS).toContain('wnba-espn');
    expect(ALL_SOURCE_SMOKE_IDS).toContain('ncaa-scoreboard');
  });

  it('parses ESPN basketball golden fixture', () => {
    const raw = { events: [loadGoldenFixture('basketball/live-standard.json')] };
    const parsed = parseEspnSource('BASKETBALL', raw);
    const report = evaluateParseBatch('BASKETBALL', parsed.games, parsed.rawCount, parsed.skipped);
    expect(report.healthy).toBe(true);
    expect(hasBlockingIssues(report.issues)).toBe(false);
  });

  it('parses Action Network NBA fixture', () => {
    const raw = loadGoldenFixture('action-network/nba-live.json');
    const parsed = parseActionNetworkSource('nba', raw);
    const report = evaluateParseBatch('BASKETBALL', parsed.games, parsed.rawCount, parsed.skipped);
    expect(parsed.games).toHaveLength(1);
    expect(parsed.games[0].away.abbr).toBe('LAL');
    expect(parsed.games[0].context?.oddsSpread).toBeTruthy();
    expect(report.healthy).toBe(true);
  });

  it('parses NCAA supplemental fixture', () => {
    const raw = loadGoldenFixture('supplemental/ncaa-game.json');
    const parsed = parseNcaaSource(raw);
    const report = evaluateParseBatch('NCAA', parsed.games, parsed.rawCount, parsed.skipped);
    expect(parsed.games).toHaveLength(1);
    expect(report.healthy).toBe(true);
  });

  it('parses WNBA ESPN-shaped fixture via supplemental parser', () => {
    const wnbaEvent = loadGoldenFixture('basketball/wnba-team-names.json') as Record<string, unknown>;
    const raw = { events: [wnbaEvent] };
    const parsed = parseWnbaEspnSource(raw);
    if (parsed.games.length) {
      const report = evaluateParseBatch('WNBA', parsed.games, parsed.rawCount, parsed.skipped);
      expect(report.healthy).toBe(true);
    }
  });

  for (const sport of ['FOOTBALL', 'SOCCER', 'BASEBALL', 'HOCKEY', 'TENNIS', 'GOLF', 'FIGHTS'] as const) {
    const fixtureMap: Partial<Record<typeof sport, string>> = {
      FOOTBALL: 'football/live-object-score.json',
      SOCCER: 'soccer/epl-live.json',
      BASEBALL: 'baseball/live-standard.json',
      HOCKEY: 'hockey/live-standard.json',
      TENNIS: 'tennis/atp-match.json',
      GOLF: 'golf/pga-tournament.json',
      FIGHTS: 'fights/ufc-bout-pre.json',
    };
    const file = fixtureMap[sport];
    if (!file) continue;

    it(`parses ESPN ${sport} golden fixture`, () => {
      const raw = { events: [loadGoldenFixture(file)] };
      const parsed = parseEspnSource(sport, raw);
      const report = evaluateParseBatch(sport, parsed.games, parsed.rawCount, parsed.skipped);
      expect(parsed.games.length).toBeGreaterThan(0);
      expect(hasBlockingIssues(report.issues)).toBe(false);
    });
  }
});
