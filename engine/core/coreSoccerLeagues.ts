/** The six domestic leagues surfaced on the SOCCER sport hub. */
export interface CoreSoccerLeague {
  slug: string;
  label: string;
  priority: number;
}

export const CORE_SOCCER_LEAGUES = [
  { slug: 'eng.1', label: 'Premier League', priority: 420 },
  { slug: 'esp.1', label: 'La Liga', priority: 400 },
  { slug: 'ger.1', label: 'Bundesliga', priority: 400 },
  { slug: 'ita.1', label: 'Serie A', priority: 400 },
  { slug: 'fra.1', label: 'Ligue 1', priority: 400 },
  { slug: 'usa.1', label: 'MLS', priority: 380 },
] as const satisfies readonly CoreSoccerLeague[];

export const CORE_SOCCER_LEAGUE_SLUGS = CORE_SOCCER_LEAGUES.map((l) => l.slug);

const CORE_SLUG_SET = new Set<string>(CORE_SOCCER_LEAGUE_SLUGS);

export function isCoreSoccerLeague(slug: string | undefined): boolean {
  return slug != null && CORE_SLUG_SET.has(slug);
}

export function coreSoccerLeagueLabel(slug: string): string | undefined {
  return CORE_SOCCER_LEAGUES.find((l) => l.slug === slug)?.label;
}

export function coreSoccerLeaguePriority(slug: string): number {
  return CORE_SOCCER_LEAGUES.find((l) => l.slug === slug)?.priority ?? 300;
}
