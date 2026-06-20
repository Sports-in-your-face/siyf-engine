import { describe, expect, it } from 'vitest';
import { CORE_SOCCER_LEAGUES, CORE_SOCCER_LEAGUE_SLUGS, isCoreSoccerLeague } from '../coreSoccerLeagues';
import { getCoreSoccerLeagueSlugs } from '../../sources/soccerLeagues';
import { SUPPLEMENTAL_SOCCER_LEAGUES } from '../../sources/soccerSupplementalFeeds';

describe('coreSoccerLeagues', () => {
  it('defines all six domestic hub leagues', () => {
    expect(CORE_SOCCER_LEAGUE_SLUGS).toEqual([
      'eng.1',
      'esp.1',
      'ger.1',
      'ita.1',
      'fra.1',
      'usa.1',
    ]);
    expect(CORE_SOCCER_LEAGUES.map((l) => l.label)).toEqual([
      'Premier League',
      'La Liga',
      'Bundesliga',
      'Serie A',
      'Ligue 1',
      'MLS',
    ]);
  });

  it('excludes core leagues from supplemental list', () => {
    const coreSet = new Set<string>(CORE_SOCCER_LEAGUE_SLUGS);
    for (const { slug } of SUPPLEMENTAL_SOCCER_LEAGUES) {
      expect(coreSet.has(slug)).toBe(false);
    }
  });

  it('exposes core slugs via soccerLeagues helper', () => {
    expect(getCoreSoccerLeagueSlugs()).toEqual(CORE_SOCCER_LEAGUE_SLUGS);
  });

  it('recognizes core league slugs', () => {
    expect(isCoreSoccerLeague('eng.1')).toBe(true);
    expect(isCoreSoccerLeague('uefa.champions')).toBe(false);
  });
});
