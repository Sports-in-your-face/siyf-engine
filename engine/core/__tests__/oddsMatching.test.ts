import { describe, expect, it } from 'vitest';
import { matchOddsEventToGame, normalizeOddsTeamName } from '../oddsMatching';
import { resolveSoccerOddsKey, soccerOddsKeysForLeagues } from '../soccerOddsLeagues';
import { makeGame, makeTeam } from './fixtures';

describe('normalizeOddsTeamName', () => {
  it('strips punctuation and lowercases', () => {
    expect(normalizeOddsTeamName('Manchester United FC')).toBe('manchesterunitedfc');
  });
});

describe('matchOddsEventToGame', () => {
  const lakersCeltics = makeGame({
    id: '1',
    away: makeTeam({ name: 'Los Angeles Lakers', abbr: 'LAL' }),
    home: makeTeam({ name: 'Boston Celtics', abbr: 'BOS' }),
  });

  it('matches NBA teams with abbreviation fallback', () => {
    expect(matchOddsEventToGame(
      { away_team: 'Los Angeles Lakers', home_team: 'Boston Celtics' },
      lakersCeltics,
      { useAbbr: true },
    )).toBe(true);
  });

  it('matches when odds API uses short city names', () => {
    expect(matchOddsEventToGame(
      { away_team: 'Lakers', home_team: 'Celtics' },
      lakersCeltics,
      { useAbbr: true },
    )).toBe(true);
  });

  it('rejects swapped home/away', () => {
    expect(matchOddsEventToGame(
      { away_team: 'Boston Celtics', home_team: 'Los Angeles Lakers' },
      lakersCeltics,
      { useAbbr: true },
    )).toBe(false);
  });

  it('matches soccer teams with 4-char prefix', () => {
    const game = makeGame({
      id: '2',
      sport: 'SOCCER',
      leagueSlug: 'eng.1',
      away: makeTeam({ name: 'Arsenal', abbr: 'ARS' }),
      home: makeTeam({ name: 'Chelsea', abbr: 'CHE' }),
    });

    expect(matchOddsEventToGame(
      { away_team: 'Arsenal FC', home_team: 'Chelsea' },
      game,
      { prefixLen: 4, useAbbr: false },
    )).toBe(true);
  });
});

describe('soccer odds league resolution', () => {
  it('maps ESPN slugs to odds API keys', () => {
    expect(resolveSoccerOddsKey('eng.1')).toBe('soccer_epl');
    expect(resolveSoccerOddsKey('uefa.champions')).toBe('soccer_uefa_champs_league');
    expect(resolveSoccerOddsKey('esp.1')).toBe('soccer_spain_la_liga');
    expect(resolveSoccerOddsKey('unknown.league')).toBe('soccer_epl');
  });

  it('fetches only keys needed for requested leagues', () => {
    const keys = soccerOddsKeysForLeagues(new Set(['esp.1', 'ger.1']));
    expect(keys.map((k) => k.key).sort()).toEqual([
      'soccer_germany_bundesliga',
      'soccer_spain_la_liga',
    ]);
  });

  it('dedupes when multiple games share a league bucket', () => {
    const keys = soccerOddsKeysForLeagues(new Set(['eng.1', 'eng.1']));
    expect(keys).toHaveLength(1);
    expect(keys[0].key).toBe('soccer_epl');
  });
});
