import { describe, expect, it } from 'vitest';
import type { BookmarkedTeam, Game } from '../../types';
import { bookmarkSide, gameMatchesBookmark } from '../bookmarkMatch';

const cavsBookmark: BookmarkedTeam = {
  id: '5',
  name: 'Cleveland Cavaliers',
  abbr: 'CLE',
  logo: '',
  sport: 'BASKETBALL',
};

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: '1',
    sport: 'NBA',
    status: 'Live',
    statusState: 'in',
    clock: 'Q2',
    away: { name: 'Toronto Raptors', abbr: 'TOR', score: 50 },
    home: { name: 'Cleveland Cavaliers', abbr: 'CLE', score: 48 },
    ...overrides,
  };
}

describe('gameMatchesBookmark', () => {
  it('matches NBA bookmarks by abbreviation', () => {
    expect(gameMatchesBookmark(makeGame(), cavsBookmark)).toBe(true);
  });

  it('does not match WNBA games for NBA bookmarks with shared abbreviations', () => {
    const wnbaGame = makeGame({
      sport: 'WNBA',
      away: { name: 'Atlanta Dream', abbr: 'ATL', score: 0 },
      home: { name: 'Chicago Sky', abbr: 'CHI', score: 0 },
    });
    const hawksBookmark: BookmarkedTeam = {
      ...cavsBookmark,
      id: '1',
      name: 'Atlanta Hawks',
      abbr: 'ATL',
    };
    expect(gameMatchesBookmark(wnbaGame, hawksBookmark)).toBe(false);
  });

  it('prefers team id when available', () => {
    const game = makeGame({
      home: { id: '5', name: 'Cleveland Cavaliers', abbr: 'CLE', score: 10 },
    });
    expect(gameMatchesBookmark(game, cavsBookmark)).toBe(true);
  });
});

describe('bookmarkSide', () => {
  it('returns home or away for the bookmarked team', () => {
    expect(bookmarkSide(makeGame(), cavsBookmark)).toBe('home');
    expect(bookmarkSide(makeGame({
      away: { name: 'Cleveland Cavaliers', abbr: 'CLE', score: 1 },
      home: { name: 'Toronto Raptors', abbr: 'TOR', score: 2 },
    }), cavsBookmark)).toBe('away');
  });
});
