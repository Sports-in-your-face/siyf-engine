import { espnGlobalSearchAll, type EspnGlobalSearchHit } from '../engine/sources/espnCoreSearch';
import { searchSoccerAthletesAllLeagues } from '../engine/sources/soccerLeagueOps';
import { leagueLabel } from '../engine/sources/teamRegistry';
import { getSportUiMeta } from './webView';
import { fetchTeams, getCachedTeams, type SportType } from './api';

export type SearchResultType = 'player' | 'team' | 'game';

export interface SearchResultItem {
  type: SearchResultType;
  id: string;
  name: string;
  subtitle: string;
  sport: SportType;
  sportLabel: string;
  link: string;
  logo?: string;
  headshot?: string;
  abbr?: string;
  team?: string;
  espnId?: string;
  awayName?: string;
  homeName?: string;
}

const TEAM_SPORTS: SportType[] = ['BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY', 'SOCCER'];

const ESPN_LEAGUE_SPORT: Record<string, SportType> = {
  nba: 'BASKETBALL',
  wnba: 'BASKETBALL',
  'mens-college-basketball': 'BASKETBALL',
  'womens-college-basketball': 'BASKETBALL',
  nfl: 'FOOTBALL',
  mlb: 'BASEBALL',
  nhl: 'HOCKEY',
  'usa.1': 'SOCCER',
  'eng.1': 'SOCCER',
  'esp.1': 'SOCCER',
  'ger.1': 'SOCCER',
  'fra.1': 'SOCCER',
  'ita.1': 'SOCCER',
  'ned.1': 'SOCCER',
  'por.1': 'SOCCER',
  'mex.1': 'SOCCER',
  'bra.1': 'SOCCER',
  'uefa.champions': 'SOCCER',
  'uefa.europa': 'SOCCER',
  'uefa.europa.conf': 'SOCCER',
  mls: 'SOCCER',
  pga: 'GOLF',
  lpga: 'GOLF',
  atp: 'TENNIS',
  wta: 'TENNIS',
  ufc: 'FIGHTS',
};

const ESPN_SPORT_SLUG: Record<string, SportType> = {
  basketball: 'BASKETBALL',
  football: 'FOOTBALL',
  baseball: 'BASEBALL',
  hockey: 'HOCKEY',
  soccer: 'SOCCER',
  golf: 'GOLF',
  tennis: 'TENNIS',
  mma: 'FIGHTS',
};

function resolveSportFromEspn(sport?: string, league?: string): SportType | null {
  const leagueKey = (league ?? '').toLowerCase();
  const sportKey = (sport ?? '').toLowerCase();
  if (leagueKey && ESPN_LEAGUE_SPORT[leagueKey]) return ESPN_LEAGUE_SPORT[leagueKey];
  if (sportKey && ESPN_SPORT_SLUG[sportKey]) return ESPN_SPORT_SLUG[sportKey];
  return null;
}

function toSearchItem(
  type: SearchResultType,
  sport: SportType,
  fields: Omit<SearchResultItem, 'type' | 'sport' | 'sportLabel' | 'link'>,
): SearchResultItem {
  const meta = getSportUiMeta(sport);
  return {
    type,
    sport,
    sportLabel: meta.label,
    link: meta.route,
    ...fields,
  };
}

function mapEspnHit(hit: EspnGlobalSearchHit): SearchResultItem | null {
  const sport = resolveSportFromEspn(hit.sport, hit.league);
  if (!sport) return null;

  if (hit.type === 'player') {
    const leagueName = sport === 'SOCCER' && hit.league ? leagueLabel(hit.league) : undefined;
    return toSearchItem('player', sport, {
      id: hit.id,
      name: hit.name,
      subtitle: [hit.team, hit.position, leagueName || getSportUiMeta(sport).label].filter(Boolean).join(' · '),
      headshot: hit.headshot,
      team: hit.team,
      espnId: hit.id,
    });
  }

  if (hit.type === 'team') {
    return toSearchItem('team', sport, {
      id: hit.id,
      name: hit.name,
      subtitle: getSportUiMeta(sport).label,
      abbr: hit.abbr || hit.name.slice(0, 3).toUpperCase(),
      logo: hit.logo,
      espnId: hit.id,
    });
  }

  const matchup = hit.awayName && hit.homeName
    ? `${hit.awayName} vs ${hit.homeName}`
    : hit.name;
  const dateLabel = hit.date
    ? new Date(hit.date).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : null;

  return toSearchItem('game', sport, {
    id: hit.id,
    name: matchup,
    subtitle: [dateLabel, getSportUiMeta(sport).label].filter(Boolean).join(' · '),
    awayName: hit.awayName,
    homeName: hit.homeName,
    abbr: hit.awayAbbr && hit.homeAbbr ? `${hit.awayAbbr}@${hit.homeAbbr}` : undefined,
  });
}

function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

async function searchLocalTeams(query: string): Promise<SearchResultItem[]> {
  const hits: SearchResultItem[] = [];

  await Promise.all(
    TEAM_SPORTS.map(async (sport) => {
      const teams = getCachedTeams(sport) ?? await fetchTeams(sport);
      for (const team of teams) {
        if (
          !matchesQuery(team.name, query)
          && !matchesQuery(team.abbr, query)
        ) continue;

        hits.push(toSearchItem('team', sport, {
          id: team.id,
          name: team.name,
          subtitle: getSportUiMeta(sport).label,
          abbr: team.abbr,
          logo: team.logo,
          espnId: team.id,
        }));
      }
    }),
  );

  return hits.slice(0, 10);
}

interface SoccerAthleteHit {
  athlete?: {
    id?: string | number;
    displayName?: string;
    fullName?: string;
    headshot?: { href?: string } | string;
    team?: { abbreviation?: string; displayName?: string };
    position?: { abbreviation?: string };
  };
  id?: string | number;
  leagueSlug?: string;
}

async function searchSoccerPlayers(query: string): Promise<SearchResultItem[]> {
  const hits = await searchSoccerAthletesAllLeagues(query).catch(() => []);
  const results: SearchResultItem[] = [];

  for (const item of hits) {
    const hit = item as SoccerAthleteHit;
    const athlete = hit.athlete ?? {};
    const id = String(athlete.id ?? hit.id ?? '');
    const name = athlete.displayName ?? athlete.fullName ?? '';
    if (!id || !name) continue;

    const slug = hit.leagueSlug ?? 'usa.1';
    const team = athlete.team?.abbreviation ?? athlete.team?.displayName;
    const pos = athlete.position?.abbreviation;
    const headshot = typeof athlete.headshot === 'object'
      ? athlete.headshot?.href
      : athlete.headshot;

    results.push(toSearchItem('player', 'SOCCER', {
      id,
      name,
      subtitle: [team, pos, leagueLabel(slug)].filter(Boolean).join(' · '),
      headshot,
      team,
      espnId: id,
    }));
  }

  return results.slice(0, 12);
}

async function searchEspnGlobal(query: string): Promise<SearchResultItem[]> {
  const hits = await espnGlobalSearchAll(query);
  const results: SearchResultItem[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const mapped = mapEspnHit(hit);
    if (!mapped) continue;
    const key = `${mapped.type}:${mapped.sport}:${mapped.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(mapped);
  }

  return results;
}

function rankResults(items: SearchResultItem[], query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase();

  const score = (item: SearchResultItem) => {
    const name = item.name.toLowerCase();
    let value = 0;
    if (name === q) value += 100;
    else if (name.startsWith(q)) value += 60;
    else if (item.abbr?.toLowerCase() === q) value += 80;
    else if (name.includes(q)) value += 30;

    if (item.type === 'team') value += 8;
    else if (item.type === 'player') value += 5;
    else value += 3;

    return value;
  };

  return [...items].sort((a, b) => score(b) - score(a));
}

/** Unified search across teams, players, and games. Uses ESPN global search + local team cache. */
export async function searchCatalog(query: string): Promise<SearchResultItem[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const [localTeams, globalHits, soccerPlayers] = await Promise.all([
    searchLocalTeams(trimmed),
    searchEspnGlobal(trimmed).catch(() => []),
    searchSoccerPlayers(trimmed).catch(() => []),
  ]);

  const merged: SearchResultItem[] = [];
  const seen = new Set<string>();

  for (const item of [...localTeams, ...globalHits, ...soccerPlayers]) {
    const key = `${item.type}:${item.sport}:${item.id}:${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return rankResults(merged, trimmed).slice(0, 20);
}
