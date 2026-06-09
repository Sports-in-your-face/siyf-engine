/** Maps ESPN soccer league slugs to The-Odds-API sport keys. */
export const SOCCER_ODDS_LEAGUE_KEYS: { key: string; leagues: string[] }[] = [
  { key: 'soccer_epl', leagues: ['eng.1'] },
  { key: 'soccer_uefa_champs_league', leagues: ['uefa.champions'] },
  { key: 'soccer_uefa_europa_league', leagues: ['uefa.europa'] },
  { key: 'soccer_spain_la_liga', leagues: ['esp.1'] },
  { key: 'soccer_germany_bundesliga', leagues: ['ger.1'] },
  { key: 'soccer_france_ligue_one', leagues: ['fra.1'] },
  { key: 'soccer_italy_serie_a', leagues: ['ita.1'] },
  { key: 'soccer_usa_mls', leagues: ['usa.1'] },
];

export function resolveSoccerOddsKey(leagueSlug: string): string {
  return SOCCER_ODDS_LEAGUE_KEYS.find((k) => k.leagues.includes(leagueSlug))?.key ?? 'soccer_epl';
}

export function soccerOddsKeysForLeagues(leagues: Set<string>): { key: string; leagues: string[] }[] {
  return SOCCER_ODDS_LEAGUE_KEYS.filter(({ leagues: ls }) =>
    ls.some((league) => leagues.has(league)),
  );
}
