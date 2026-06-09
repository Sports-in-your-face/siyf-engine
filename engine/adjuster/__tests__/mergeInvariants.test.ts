import { describe, expect, it } from 'vitest';
import { dedupeGamesById, gameDedupeKey, gameMatchKey, mergeScoreboardGames } from '../../core/mergeGames';
import { makeGame, makeOddsContext, makeTeam } from '../../core/__tests__/fixtures';
import {
  runMergePipeline,
  validateDedupeHealth,
  validateMergeHealth,
} from '../invariants/merge';

describe('gameDedupeKey', () => {
  it('scopes WNBA ids separately from NBA', () => {
    const nba = makeGame({ id: '42', sport: 'NBA', away: makeTeam({ name: 'A', abbr: 'A' }), home: makeTeam({ name: 'B', abbr: 'B' }) });
    const wnba = makeGame({ ...nba, sport: 'WNBA' });
    expect(gameDedupeKey(nba)).toBe('42');
    expect(gameDedupeKey(wnba)).toBe('WNBA:42');
  });

  it('scopes NCAA ids separately', () => {
    const game = makeGame({ id: '7', sport: 'NCAA', away: makeTeam({ name: 'A', abbr: 'A' }), home: makeTeam({ name: 'B', abbr: 'B' }) });
    expect(gameDedupeKey(game)).toBe('NCAA:7');
  });

  it('prefixes league slug for soccer', () => {
    const game = makeGame({
      id: '99',
      leagueSlug: 'uefa.champions',
      sport: 'SOCCER',
      away: makeTeam({ name: 'A', abbr: 'A' }),
      home: makeTeam({ name: 'B', abbr: 'B' }),
    });
    expect(gameDedupeKey(game)).toBe('uefa.champions:99');
  });
});

describe('validateMergeHealth', () => {
  it('passes for clean single-game merge', () => {
    const game = makeGame({
      id: '1',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
    });
    const issues = validateMergeHealth({
      primary: [game],
      secondary: [],
      merged: [game],
    });
    expect(issues).toEqual([]);
  });

  it('ignores secondary games without odds', () => {
    const primary = makeGame({
      id: '1',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
    });
    const orphan = makeGame({
      id: '2',
      away: makeTeam({ name: 'MIA', abbr: 'MIA' }),
      home: makeTeam({ name: 'NYK', abbr: 'NYK' }),
    });
    const issues = validateMergeHealth({
      primary: [primary],
      secondary: [orphan],
      merged: [primary, orphan],
    });
    expect(issues.filter((i) => i.code === 'merge.orphan_odds')).toEqual([]);
  });

  it('flags orphan odds with custom secondary label', () => {
    const primary = makeGame({
      id: '1',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
    });
    const secondary = makeGame({
      id: '2',
      away: makeTeam({ name: 'MIA', abbr: 'MIA' }),
      home: makeTeam({ name: 'NYK', abbr: 'NYK' }),
      context: makeOddsContext({ oddsSpread: 'MIA +5.5', oddsBook: 'FANDUEL' }),
    });
    const issues = validateMergeHealth({
      primary: [primary],
      secondary: [secondary],
      merged: [primary, secondary],
      secondaryLabel: 'test-feed',
    });
    const orphan = issues.find((i) => i.code === 'merge.orphan_odds');
    expect(orphan?.message).toContain('test-feed');
    expect(orphan?.gameId).toBe('2');
  });

  it('does not flag orphan when secondary odds match primary matchup', () => {
    const primary = makeGame({
      id: '1',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
    });
    const secondary = makeGame({
      id: '2',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
      context: makeOddsContext({ oddsSpread: 'LAL -4.5', oddsBook: 'DRAFTKINGS' }),
    });
    const issues = validateMergeHealth({
      primary: [primary],
      secondary: [secondary],
      merged: [primary],
    });
    expect(issues.filter((i) => i.code === 'merge.orphan_odds')).toEqual([]);
  });
});

describe('validateDedupeHealth', () => {
  it('passes after dedupe collapses same-scope duplicates', () => {
    const a = makeGame({
      id: '10',
      sport: 'NBA',
      statusState: 'pre',
      away: makeTeam({ name: 'A', abbr: 'A' }),
      home: makeTeam({ name: 'B', abbr: 'B' }),
    });
    const b = makeGame({ ...a, statusState: 'post' });
    const issues = validateDedupeHealth([a, b]);
    expect(issues).toEqual([]);
    expect(dedupeGamesById([a, b])).toHaveLength(1);
  });

  it('passes for empty input', () => {
    expect(validateDedupeHealth([])).toEqual([]);
  });
});

describe('mergeScoreboardGames + runMergePipeline', () => {
  it('keeps ESPN id when merging with secondary', () => {
    const espn = makeGame({
      id: 'espn-501',
      statusState: 'in',
      away: makeTeam({ name: 'LAL', abbr: 'LAL', score: 100 }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS', score: 98 }),
    });
    const secondary = makeGame({
      id: 'an-999',
      statusState: 'in',
      away: makeTeam({ name: 'LAL', abbr: 'LAL', score: 102 }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS', score: 98 }),
      context: makeOddsContext({ oddsSpread: 'LAL -4.5', oddsBook: 'DRAFTKINGS' }),
    });
    const merged = mergeScoreboardGames([espn], [secondary]);
    expect(merged[0].id).toBe('espn-501');
    expect(merged[0].away.score).toBe(102);
  });

  it('runMergePipeline can skip odds validation', () => {
    const primary = [makeGame({
      id: '1',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
    })];
    const secondary = [makeGame({
      id: '2',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
      context: makeOddsContext({ oddsSpread: '[object Object]' as string }),
    })];
    const withOdds = runMergePipeline({ primary, secondary });
    const withoutOdds = runMergePipeline({ primary, secondary, validateOdds: false });
    expect(withOdds.healthy).toBe(false);
    expect(withoutOdds.healthy).toBe(true);
    expect(withoutOdds.oddsIssues).toEqual([]);
  });

  it('runMergePipeline marks unhealthy on duplicate matchup output', () => {
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
    const pipeline = runMergePipeline({ primary: [gameA], secondary: [gameB] });
    expect(pipeline.healthy).toBe(true);
    expect(gameMatchKey('LAL', 'BOS')).toBe('LAL@BOS');
  });
});
