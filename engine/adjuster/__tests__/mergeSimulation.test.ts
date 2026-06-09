import { beforeEach, describe, expect, it } from 'vitest';
import { dedupeGamesById } from '../../core/mergeGames';
import { makeGame, makeOddsContext, makeTeam } from '../../core/__tests__/fixtures';
import { loadGoldenFixture } from '../fixtureTestUtils';
import {
  runMergePipeline,
  validateDedupeHealth,
  validateMergeHealth,
} from '../invariants/merge';
import { validateGameOdds, validateGamesOdds } from '../invariants/odds';
import { MERGE_SCENARIOS } from '../simulator/mergeScenarios';
import {
  runAllMergeScenarios,
  runMergeScenario,
  summarizeMergeSimulations,
} from '../simulator/runMergeSimulation';
import { countMergeMatches, simulateEspnActionNetworkMerge } from '../liveSmoke/mergeSmoke';
import { resetParseTelemetry } from '../telemetry';

describe('merge simulation scenarios', () => {
  beforeEach(() => resetParseTelemetry());

  it('defines healthy and failure merge scenarios', () => {
    const healthy = MERGE_SCENARIOS.filter((s) => s.expectHealthy);
    const failures = MERGE_SCENARIOS.filter((s) => !s.expectHealthy);
    expect(MERGE_SCENARIOS.length).toBeGreaterThanOrEqual(12);
    expect(healthy.length).toBeGreaterThanOrEqual(9);
    expect(failures.length).toBeGreaterThanOrEqual(3);
  });

  for (const scenario of MERGE_SCENARIOS) {
    it(`${scenario.id}: ${scenario.description}`, () => {
      const result = runMergeScenario(scenario);
      expect(result.recovered, result.failureReason ?? 'no reason').toBe(true);
    });
  }

  it('all merge scenarios pass in batch', () => {
    const results = runAllMergeScenarios(MERGE_SCENARIOS);
    const summary = summarizeMergeSimulations(results);
    expect(summary.failed).toBe(0);
    expect(summary.recovered).toBe(summary.total);
  });
});

describe('ESPN + Action Network merge (offline)', () => {
  it('merges NBA fixtures without duplicate matchup keys', () => {
    const espnRaw = { events: [loadGoldenFixture('basketball/live-standard.json')] };
    const anRaw = loadGoldenFixture('action-network/nba-live.json');

    const result = simulateEspnActionNetworkMerge('merge-nba', 'BASKETBALL', espnRaw, anRaw, 'nba');
    const pipeline = runMergePipeline({
      primary: result.espnGames,
      secondary: result.anGames,
      secondaryLabel: 'action-network',
    });

    expect(result.espnGames).toHaveLength(1);
    expect(result.anGames).toHaveLength(1);
    expect(pipeline.merged).toHaveLength(1);
    expect(pipeline.healthy).toBe(true);
    expect(pipeline.mergeIssues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(countMergeMatches(result.espnGames, result.anGames)).toBe(1);
    expect(pipeline.merged[0].context?.oddsSpread ?? pipeline.merged[0].context?.oddsTotal).toBeTruthy();
  });

  it('flags orphan odds when Action Network has no ESPN match', () => {
    const espnRaw = { events: [loadGoldenFixture('basketball/live-standard.json')] };
    const anFixture = loadGoldenFixture('action-network/nba-live.json') as { games: Record<string, unknown>[] };
    const anRaw = {
      games: [{
        ...anFixture.games[0],
        teams: [
          { id: 99, full_name: 'Miami Heat', abbr: 'MIA' },
          { id: 98, full_name: 'New York Knicks', abbr: 'NYK' },
        ],
        away_team_id: 99,
        home_team_id: 98,
      }],
    };

    const result = simulateEspnActionNetworkMerge('merge-orphan', 'BASKETBALL', espnRaw, anRaw, 'nba');
    const issues = validateMergeHealth({
      primary: result.espnGames,
      secondary: result.anGames,
      merged: result.merged,
      secondaryLabel: 'action-network',
    });

    expect(issues.some((i) => i.code === 'merge.orphan_odds')).toBe(true);
    expect(result.merged.length).toBeGreaterThan(1);
  });
});

describe('dedupe health', () => {
  it('passes for WNBA + NBA same id', () => {
    const nba = makeGame({
      id: '99',
      sport: 'NBA',
      away: makeTeam({ name: 'Hawks', abbr: 'ATL' }),
      home: makeTeam({ name: 'Bulls', abbr: 'CHI' }),
    });
    const wnba = makeGame({ ...nba, sport: 'WNBA' });
    const deduped = dedupeGamesById([nba, wnba]);
    expect(deduped).toHaveLength(2);
    expect(validateDedupeHealth([nba, wnba])).toEqual([]);
  });

  it('passes for multi-league soccer same id', () => {
    const epl = makeGame({
      id: '99',
      leagueSlug: 'eng.1',
      sport: 'SOCCER',
      away: makeTeam({ name: 'A', abbr: 'A' }),
      home: makeTeam({ name: 'B', abbr: 'B' }),
    });
    const mls = makeGame({ ...epl, leagueSlug: 'usa.1' });
    const deduped = dedupeGamesById([epl, mls]);
    expect(deduped).toHaveLength(2);
    expect(validateDedupeHealth([epl, mls])).toEqual([]);
  });

  it('collapses same-scope duplicates to one row', () => {
    const pre = makeGame({
      id: '1',
      leagueSlug: 'eng.1',
      sport: 'SOCCER',
      statusState: 'pre',
      away: makeTeam({ name: 'A', abbr: 'A' }),
      home: makeTeam({ name: 'B', abbr: 'B' }),
    });
    const live = makeGame({ ...pre, statusState: 'in' });
    const deduped = dedupeGamesById([pre, live]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].statusState).toBe('in');
    expect(validateDedupeHealth([pre, live])).toEqual([]);
  });
});

describe('odds normalization', () => {
  it('accepts well-formed odds strings', () => {
    const game = makeGame({
      id: 'ok',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
      context: makeOddsContext({
        oddsSpread: 'LAL -4.5 · BOS +4.5',
        oddsTotal: 'O/U 224.5',
        oddsBook: 'DRAFTKINGS',
      }),
    });
    expect(validateGameOdds(game)).toEqual([]);
  });

  it('flags object leak in spread', () => {
    const game = makeGame({
      id: 'leak',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
      context: makeOddsContext({ oddsSpread: '[object Object]', oddsBook: 'DRAFTKINGS' }),
    });
    const issues = validateGameOdds(game);
    expect(issues.some((i) => i.code === 'odds.object_leak')).toBe(true);
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('flags non-string spread values', () => {
    const game = makeGame({
      id: 'bad',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
      context: makeOddsContext({ oddsSpread: 4.5 as unknown as string, oddsBook: 'DRAFTKINGS' }),
    });
    const issues = validateGameOdds(game);
    expect(issues.some((i) => i.code === 'odds.malformed_spread')).toBe(true);
  });

  it('warns when book label is missing', () => {
    const game = makeGame({
      id: 'nobook',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
      context: makeOddsContext({ oddsSpread: 'LAL -4.5', oddsTotal: 'O/U 220.5' }),
    });
    const issues = validateGameOdds(game);
    expect(issues.some((i) => i.code === 'odds.book_missing' && i.severity === 'warn')).toBe(true);
  });

  it('validates odds across merged batch', () => {
    const good = makeGame({
      id: 'g1',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
      context: makeOddsContext({ oddsSpread: 'LAL -4.5', oddsBook: 'DRAFTKINGS' }),
    });
    const bad = makeGame({
      id: 'g2',
      away: makeTeam({ name: 'MIA', abbr: 'MIA' }),
      home: makeTeam({ name: 'NYK', abbr: 'NYK' }),
      context: makeOddsContext({ oddsTotal: '[object Object]' as string }),
    });
    const issues = validateGamesOdds([good, bad]);
    expect(issues.filter((i) => i.gameId === 'g1')).toEqual([]);
    expect(issues.some((i) => i.gameId === 'g2' && i.code === 'odds.object_leak')).toBe(true);
  });
});

describe('merge health gates', () => {
  it('detects duplicate matchup keys', () => {
    const gameA = makeGame({
      id: '1',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
    });
    const gameB = makeGame({
      id: '2',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
    });
    const issues = validateMergeHealth({
      primary: [gameA],
      secondary: [gameB],
      merged: [gameA, gameB],
    });
    expect(issues.some((i) => i.code === 'merge.duplicate_key')).toBe(true);
  });

  it('detects empty merge result when primary had games', () => {
    const primary = [makeGame({
      id: 'x',
      away: makeTeam({ name: 'A', abbr: 'AAA' }),
      home: makeTeam({ name: 'B', abbr: 'BBB' }),
    })];
    const issues = validateMergeHealth({ primary, secondary: [], merged: [] });
    expect(issues.some((i) => i.code === 'merge.empty_result')).toBe(true);
  });

  it('runMergePipeline combines merge and odds gates', () => {
    const primary = [makeGame({
      id: 'p1',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
    })];
    const secondary = [makeGame({
      id: 's1',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
      context: makeOddsContext({ oddsSpread: 'LAL -4.5', oddsTotal: 'O/U 220.5', oddsBook: 'DRAFTKINGS' }),
    })];
    const pipeline = runMergePipeline({ primary, secondary });
    expect(pipeline.merged).toHaveLength(1);
    expect(pipeline.healthy).toBe(true);
    expect(pipeline.oddsIssues).toEqual([]);
  });
});
