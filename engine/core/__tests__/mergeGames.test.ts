import { describe, expect, it } from 'vitest';
import { mergeContext } from '../../../services/parsers/parseBasketballContext';
import { mergeSoccerContext } from '../../../services/parsers/parseSoccerContext';
import { dedupeGamesById, gameListKey, gameMatchKey, mergeScoreboardGames } from '../mergeGames';
import { enrichGameContext } from '../mergePayload';
import { makeGame, makeTeam } from './fixtures';

describe('dedupeGamesById', () => {
  it('keeps live game over scheduled duplicate in same league', () => {
    const pre = makeGame({
      id: '1',
      leagueSlug: 'eng.1',
      sport: 'SOCCER',
      statusState: 'pre',
      away: makeTeam({ name: 'Arsenal', abbr: 'ARS', score: 0 }),
      home: makeTeam({ name: 'Chelsea', abbr: 'CHE', score: 0 }),
    });
    const live = makeGame({
      ...pre,
      statusState: 'in',
      away: { ...pre.away, score: 1 },
    });

    const result = dedupeGamesById([pre, live]);
    expect(result).toHaveLength(1);
    expect(result[0].statusState).toBe('in');
  });

  it('allows same id across WNBA and NBA', () => {
    const nba = makeGame({
      id: '99',
      sport: 'NBA',
      away: makeTeam({ name: 'Hawks', abbr: 'ATL' }),
      home: makeTeam({ name: 'Bulls', abbr: 'CHI' }),
    });
    const wnba = makeGame({
      ...nba,
      sport: 'WNBA',
      away: makeTeam({ name: 'Dream', abbr: 'ATL' }),
      home: makeTeam({ name: 'Sky', abbr: 'CHI' }),
    });

    expect(dedupeGamesById([nba, wnba])).toHaveLength(2);
  });

  it('allows same id across different leagues', () => {
    const epl = makeGame({
      id: '99',
      leagueSlug: 'eng.1',
      sport: 'SOCCER',
      away: makeTeam({ name: 'A', abbr: 'A' }),
      home: makeTeam({ name: 'B', abbr: 'B' }),
    });
    const mls = makeGame({
      ...epl,
      leagueSlug: 'usa.1',
      away: makeTeam({ name: 'C', abbr: 'C' }),
    });

    expect(dedupeGamesById([epl, mls])).toHaveLength(2);
  });
});

describe('gameListKey', () => {
  it('includes league slug for disambiguation', () => {
    const game = makeGame({
      id: '401',
      leagueSlug: 'uefa.champions',
      away: makeTeam({ name: 'A', abbr: 'A' }),
      home: makeTeam({ name: 'B', abbr: 'B' }),
    });
    expect(gameListKey(game, 'live')).toBe('live-uefa.champions-401');
  });
});

describe('mergeScoreboardGames', () => {
  it('prefers fresher live scores from secondary source', () => {
    const espn = makeGame({
      id: '501',
      away: makeTeam({ name: 'Lakers', abbr: 'LAL', score: 98 }),
      home: makeTeam({ name: 'Celtics', abbr: 'BOS', score: 96 }),
      statusState: 'in',
      clock: 'Q4 2:00',
    });
    const bdl = makeGame({
      id: '999',
      away: makeTeam({ name: 'Lakers', abbr: 'LAL', score: 100 }),
      home: makeTeam({ name: 'Celtics', abbr: 'BOS', score: 96 }),
      statusState: 'in',
      clock: 'Q4 1:12',
    });

    const merged = mergeScoreboardGames([espn], [bdl]);
    expect(merged).toHaveLength(1);
    expect(merged[0].away.score).toBe(100);
    expect(merged[0].clock).toBe('Q4 1:12');
  });

  it('matches games by normalized abbr', () => {
    expect(gameMatchKey('LAL', 'BOS')).toBe('LAL@BOS');
    expect(gameMatchKey('lal', 'bos')).toBe('LAL@BOS');
  });
});

describe('mergeContext odds-only patches', () => {
  it('creates context when only odds fields are provided', () => {
    const ctx = mergeContext(undefined, {
      oddsSpread: 'LAL -4.5',
      oddsTotal: 'O/U 220.5',
      oddsBook: 'DRAFTKINGS',
      priority: 200,
    });

    expect(ctx?.oddsSpread).toBe('LAL -4.5');
    expect(ctx?.oddsBook).toBe('DRAFTKINGS');
    expect(ctx?.phase).toBe('regular');
  });

  it('mergeSoccerContext accepts odds-only patches', () => {
    const ctx = mergeSoccerContext(undefined, {
      oddsSpread: 'Arsenal -120 · Chelsea +100',
      oddsTotal: 'O/U 2.5',
      oddsBook: 'FANDUEL',
      priority: 200,
    });

    expect(ctx?.oddsSpread).toContain('Arsenal');
    expect(ctx?.oddsBook).toBe('FANDUEL');
    expect(ctx?.phase).toBe('regular');
  });
});

describe('enrichGameContext odds merge', () => {
  it('merges odds fields without dropping existing context', () => {
    const game = makeGame({
      id: '601',
      away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
      home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
      context: { phase: 'regular', priority: 100, badge: 'NBA' },
    });

    const enriched = enrichGameContext(game, {
      oddsSpread: 'LAL -4.5 · BOS +4.5',
      oddsTotal: 'O/U 224.5',
      oddsBook: 'DRAFTKINGS',
      priority: 200,
    });

    expect(enriched.context?.badge).toBe('NBA');
    expect(enriched.context?.oddsSpread).toContain('LAL -4.5');
    expect(enriched.context?.priority).toBe(200);
  });
});
