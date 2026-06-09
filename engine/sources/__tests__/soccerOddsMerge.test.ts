import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCacheForTests } from '../../core/cache';
import { makeGame, makeTeam } from '../../core/__tests__/fixtures';
import { enrichSoccerGamesWithOdds } from '../soccerOddsSources';

vi.mock('../../core/cachedOddsFetch', () => ({
  fetchCachedPaidOdds: vi.fn(),
}));

import { fetchCachedPaidOdds } from '../../core/cachedOddsFetch';

const mockFetchOdds = vi.mocked(fetchCachedPaidOdds);

describe('enrichSoccerGamesWithOdds', () => {
  beforeEach(() => {
    resetCacheForTests();
    mockFetchOdds.mockReset();
  });

  it('merges odds only for matching league and team names', async () => {
    mockFetchOdds.mockImplementation(async (key) => {
      if (key === 'soccer_spain_la_liga') {
        return [{
          id: 'la-1',
          away_team: 'Real Madrid',
          home_team: 'Barcelona',
          bookmakers: [{
            key: 'draftkings',
            title: 'DraftKings',
            markets: [
              { key: 'h2h', outcomes: [{ name: 'Real Madrid', price: -110 }, { name: 'Barcelona', price: +100 }] },
              { key: 'totals', outcomes: [{ name: 'Over', point: 2.5 }] },
            ],
          }],
        }];
      }
      return [];
    });

    const games = [
      makeGame({
        id: '701',
        sport: 'SOCCER',
        leagueSlug: 'esp.1',
        away: makeTeam({ name: 'Real Madrid', abbr: 'RMA' }),
        home: makeTeam({ name: 'Barcelona', abbr: 'BAR' }),
      }),
      makeGame({
        id: '702',
        sport: 'SOCCER',
        leagueSlug: 'eng.1',
        away: makeTeam({ name: 'Arsenal', abbr: 'ARS' }),
        home: makeTeam({ name: 'Chelsea', abbr: 'CHE' }),
      }),
    ];

    const enriched = await enrichSoccerGamesWithOdds(games);

    expect(enriched[0].context?.oddsBook).toBe('DRAFTKINGS');
    expect(enriched[0].context?.oddsTotal).toBe('O/U 2.5');
    expect(enriched[1].context?.oddsSpread).toBeUndefined();
    expect(mockFetchOdds).toHaveBeenCalledWith(
      'soccer_spain_la_liga',
      expect.stringContaining('soccer_spain_la_liga'),
      expect.any(String),
      ['soccer'],
    );
  });

  it('skips games that already have odds context', async () => {
    mockFetchOdds.mockResolvedValue([{
      id: 'e1',
      away_team: 'Arsenal',
      home_team: 'Chelsea',
      bookmakers: [{
        key: 'fanduel',
        title: 'FanDuel',
        markets: [{ key: 'h2h', outcomes: [{ name: 'Arsenal', price: -120 }] }],
      }],
    }]);

    const game = makeGame({
      id: '703',
      sport: 'SOCCER',
      leagueSlug: 'eng.1',
      away: makeTeam({ name: 'Arsenal', abbr: 'ARS' }),
      home: makeTeam({ name: 'Chelsea', abbr: 'CHE' }),
      context: { phase: 'regular', priority: 100, oddsSpread: 'Existing line' },
    });

    const enriched = await enrichSoccerGamesWithOdds([game]);
    expect(enriched[0].context?.oddsSpread).toBe('Existing line');
  });
});
