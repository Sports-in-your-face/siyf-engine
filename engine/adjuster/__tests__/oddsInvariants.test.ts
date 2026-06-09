import { describe, expect, it } from 'vitest';
import { makeGame, makeOddsContext, makeTeam } from '../../core/__tests__/fixtures';
import { validateGameOdds, validateGamesOdds } from '../invariants/odds';

function gameWithOdds(context: ReturnType<typeof makeOddsContext>) {
  return makeGame({
    id: 'odds-test',
    away: makeTeam({ name: 'Away', abbr: 'AWY' }),
    home: makeTeam({ name: 'Home', abbr: 'HME' }),
    context,
  });
}

describe('validateGameOdds', () => {
  it('returns no issues when context is absent', () => {
    const game = makeGame({
      id: 'no-ctx',
      away: makeTeam({ name: 'A', abbr: 'A' }),
      home: makeTeam({ name: 'B', abbr: 'B' }),
    });
    expect(validateGameOdds(game)).toEqual([]);
  });

  it('accepts spread, total, and book together', () => {
    const issues = validateGameOdds(gameWithOdds(makeOddsContext({
      oddsSpread: 'AWY -3.5 · HME +3.5',
      oddsTotal: 'O/U 210.5',
      oddsBook: 'DRAFTKINGS',
    })));
    expect(issues).toEqual([]);
  });

  it('accepts book-only context without lines', () => {
    const issues = validateGameOdds(gameWithOdds(makeOddsContext({ oddsBook: 'FANDUEL' })));
    expect(issues).toEqual([]);
  });

  it('flags odds.malformed_spread for numeric spread', () => {
    const issues = validateGameOdds(gameWithOdds(makeOddsContext({
      oddsSpread: -3.5 as unknown as string,
      oddsBook: 'DRAFTKINGS',
    })));
    expect(issues.some((i) => i.code === 'odds.malformed_spread')).toBe(true);
  });

  it('flags odds.malformed_total for object total', () => {
    const issues = validateGameOdds(gameWithOdds(makeOddsContext({
      oddsTotal: { value: 220 } as unknown as string,
      oddsBook: 'DRAFTKINGS',
    })));
    expect(issues.some((i) => i.code === 'odds.malformed_total')).toBe(true);
  });

  it('flags odds.malformed_book for numeric book id', () => {
    const issues = validateGameOdds(gameWithOdds(makeOddsContext({
      oddsSpread: 'AWY -3.5',
      oddsBook: 68 as unknown as string,
    })));
    expect(issues.some((i) => i.code === 'odds.malformed_book')).toBe(true);
  });

  it('flags odds.object_leak in total field', () => {
    const issues = validateGameOdds(gameWithOdds(makeOddsContext({
      oddsTotal: 'O/U [object Object]',
      oddsBook: 'BETMGM',
    })));
    expect(issues.some((i) => i.code === 'odds.object_leak' && i.field === 'context.oddsTotal')).toBe(true);
  });

  it('flags odds.object_leak in book field', () => {
    const issues = validateGameOdds(gameWithOdds(makeOddsContext({
      oddsSpread: 'AWY -3.5',
      oddsBook: '[object Object]',
    })));
    expect(issues.some((i) => i.code === 'odds.object_leak' && i.field === 'context.oddsBook')).toBe(true);
  });

  it('warns odds.book_missing for spread-only lines', () => {
    const issues = validateGameOdds(gameWithOdds(makeOddsContext({ oddsSpread: 'AWY -3.5' })));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('odds.book_missing');
    expect(issues[0].severity).toBe('warn');
  });

  it('warns odds.book_missing for total-only lines', () => {
    const issues = validateGameOdds(gameWithOdds(makeOddsContext({ oddsTotal: 'O/U 220.5' })));
    expect(issues.some((i) => i.code === 'odds.book_missing')).toBe(true);
  });
});

describe('validateGamesOdds', () => {
  it('aggregates issues across multiple games', () => {
    const games = [
      gameWithOdds(makeOddsContext({ oddsSpread: 'AWY -3.5', oddsBook: 'DRAFTKINGS' })),
      gameWithOdds(makeOddsContext({ oddsSpread: '[object Object]', oddsBook: 'DRAFTKINGS' })),
      gameWithOdds(makeOddsContext({ oddsTotal: 'O/U 220.5' })),
    ];
    const issues = validateGamesOdds(games);
    expect(issues.filter((i) => i.code === 'odds.object_leak')).toHaveLength(1);
    expect(issues.filter((i) => i.code === 'odds.book_missing')).toHaveLength(1);
  });

  it('returns empty for games without odds context', () => {
    const games = [
      makeGame({
        id: '1',
        away: makeTeam({ name: 'A', abbr: 'A' }),
        home: makeTeam({ name: 'B', abbr: 'B' }),
      }),
    ];
    expect(validateGamesOdds(games)).toEqual([]);
  });
});
