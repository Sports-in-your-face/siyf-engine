import { fetchJsonResilient } from '../core/resilientFetch';
import { cacheKey, cachedFetch } from '../core/cache';
import { profileForResource } from '../core/cacheTiers';

const SEARCH = '/api/espn/apis/common/v3/search';

export type EspnGlobalSearchType = 'player' | 'team' | 'event';

export interface EspnGlobalSearchHit {
  type: EspnGlobalSearchType;
  id: string;
  name: string;
  subtitle?: string;
  sport?: string;
  league?: string;
  abbr?: string;
  logo?: string;
  headshot?: string;
  team?: string;
  position?: string;
  awayName?: string;
  homeName?: string;
  awayAbbr?: string;
  homeAbbr?: string;
  date?: string;
}

export interface EspnSearchFilter {
  /** ESPN sport slug, e.g. baseball, golf, basketball */
  sport?: string;
  /** ESPN league slug, e.g. mlb, pga, nba */
  league?: string;
  label: string;
}

function mapGlobalSearchItem(item: Record<string, unknown>) {
  const headshot = item.headshot as { href?: string } | string | undefined;
  return {
    athlete: {
      id: String(item.id ?? ''),
      displayName: item.displayName ?? item.shortName,
      fullName: item.displayName ?? item.shortName,
      team: item.team ? { abbreviation: (item.team as { abbreviation?: string }).abbreviation } : undefined,
      position: item.position ? { abbreviation: (item.position as { abbreviation?: string }).abbreviation } : undefined,
      headshot: typeof headshot === 'object' ? headshot?.href : headshot,
    },
  };
}

function matchesFilter(item: Record<string, unknown>, filter?: EspnSearchFilter): boolean {
  if (!filter) return true;
  const sport = String(item.sport ?? '').toLowerCase();
  const league = String(item.league ?? '').toLowerCase();
  if (filter.sport && sport !== filter.sport.toLowerCase()) return false;
  if (filter.league && league !== filter.league.toLowerCase()) return false;
  return true;
}

function logoFromItem(item: Record<string, unknown>): string | undefined {
  const logos = item.logos as Array<{ href?: string }> | undefined;
  if (logos?.[0]?.href) return logos[0].href;
  const logo = item.logo as { href?: string } | string | undefined;
  if (typeof logo === 'object') return logo?.href;
  if (typeof logo === 'string') return logo;
  return undefined;
}

function headshotFromItem(item: Record<string, unknown>): string | undefined {
  const headshot = item.headshot as { href?: string } | string | undefined;
  if (typeof headshot === 'object') return headshot?.href;
  if (typeof headshot === 'string') return headshot;
  return undefined;
}

function competitorsFromEvent(item: Record<string, unknown>) {
  const event = item.event as Record<string, unknown> | undefined;
  const competitions = (event?.competitions ?? item.competitions) as Array<Record<string, unknown>> | undefined;
  const competitors = competitions?.[0]?.competitors as Array<Record<string, unknown>> | undefined;
  if (!competitors?.length) return null;

  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[1];
  const teamMeta = (entry?: Record<string, unknown>) => {
    const team = entry?.team as Record<string, unknown> | undefined;
    return {
      name: String(team?.displayName ?? team?.name ?? entry?.displayName ?? ''),
      abbr: String(team?.abbreviation ?? team?.abbr ?? ''),
    };
  };

  return {
    away: teamMeta(away),
    home: teamMeta(home),
    date: String(event?.date ?? item.date ?? ''),
  };
}

function mapGlobalSearchHit(item: Record<string, unknown>, type: EspnGlobalSearchType): EspnGlobalSearchHit | null {
  const id = String(item.id ?? '');
  if (!id) return null;

  const sport = String(item.sport ?? '');
  const league = String(item.league ?? '');

  if (type === 'player') {
    const team = item.team as { abbreviation?: string; displayName?: string } | undefined;
    const position = item.position as { abbreviation?: string } | undefined;
    return {
      type,
      id,
      name: String(item.displayName ?? item.shortName ?? item.fullName ?? ''),
      subtitle: [team?.abbreviation, position?.abbreviation].filter(Boolean).join(' · ') || undefined,
      sport,
      league,
      team: team?.abbreviation ?? team?.displayName,
      position: position?.abbreviation,
      headshot: headshotFromItem(item),
    };
  }

  if (type === 'team') {
    return {
      type,
      id,
      name: String(item.displayName ?? item.name ?? item.shortDisplayName ?? ''),
      subtitle: league ? league.toUpperCase() : sport || undefined,
      sport,
      league,
      abbr: String(item.abbreviation ?? item.abbr ?? ''),
      logo: logoFromItem(item),
    };
  }

  const matchup = competitorsFromEvent(item);
  const awayName = matchup?.away.name;
  const homeName = matchup?.home.name;
  const name = String(
    item.displayName
    ?? item.shortName
    ?? item.name
    ?? (awayName && homeName ? `${awayName} at ${homeName}` : ''),
  );

  return {
    type,
    id,
    name,
    subtitle: league ? league.toUpperCase() : sport || undefined,
    sport,
    league,
    awayName,
    homeName,
    awayAbbr: matchup?.away.abbr,
    homeAbbr: matchup?.home.abbr,
    date: matchup?.date,
  };
}

async function fetchGlobalSearchType(
  query: string,
  type: EspnGlobalSearchType,
  filter?: EspnSearchFilter,
): Promise<EspnGlobalSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const key = cacheKey('espn-global', 'search', type, trimmed, filter?.label ?? 'all');
  const result = await cachedFetch(
    key,
    profileForResource('search'),
    async () => {
      const data = await fetchJsonResilient<{ items?: Record<string, unknown>[] }>(
        `${SEARCH}?query=${encodeURIComponent(trimmed)}&limit=15&type=${type}`,
        undefined,
        { label: `espn-global-search-${type}-${filter?.label ?? 'all'}`, retries: 1, timeout: 10_000 },
      );
      const items = data?.items ?? [];
      return items
        .filter((item) => item.id && matchesFilter(item, filter))
        .map((item) => mapGlobalSearchHit(item, type))
        .filter((item): item is EspnGlobalSearchHit => Boolean(item?.name))
        .slice(0, 12);
    },
    ['search'],
  );

  return result ?? [];
}

/** ESPN global search for teams. */
export async function espnGlobalSearchTeams(
  query: string,
  filter?: EspnSearchFilter,
): Promise<EspnGlobalSearchHit[]> {
  return fetchGlobalSearchType(query, 'team', filter);
}

/** ESPN global search for events/games. */
export async function espnGlobalSearchEvents(
  query: string,
  filter?: EspnSearchFilter,
): Promise<EspnGlobalSearchHit[]> {
  return fetchGlobalSearchType(query, 'event', filter);
}

/** Run player, team, and event search in parallel. */
export async function espnGlobalSearchAll(
  query: string,
  filter?: EspnSearchFilter,
): Promise<EspnGlobalSearchHit[]> {
  const [players, teams, events] = await Promise.all([
    fetchGlobalSearchType(query, 'player', filter).catch(() => []),
    fetchGlobalSearchType(query, 'team', filter).catch(() => []),
    fetchGlobalSearchType(query, 'event', filter).catch(() => []),
  ]);
  return [...teams, ...players, ...events];
}

/**
 * Fallback when league `athletes?search=` returns 400.
 * Uses ESPN global search (`/apis/common/v3/search`).
 */
export async function espnGlobalSearchAthletes(
  query: string,
  filter?: EspnSearchFilter,
): Promise<any[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const key = cacheKey('espn-global', 'search', trimmed, filter?.label ?? 'all');
  const result = await cachedFetch(
    key,
    profileForResource('search'),
    async () => {
      const data = await fetchJsonResilient<any>(
        `${SEARCH}?query=${encodeURIComponent(trimmed)}&limit=15&type=player`,
        undefined,
        { label: `espn-global-search-${filter?.label ?? 'all'}`, retries: 1, timeout: 10_000 },
      );
      const items = (data?.items ?? []) as Record<string, unknown>[];
      return items
        .filter((item) => item.id && matchesFilter(item, filter))
        .map(mapGlobalSearchItem)
        .slice(0, 12);
    },
    ['search'],
  );

  return result ?? [];
}

/** @deprecated alias — uses global search now */
export async function espnCoreSearchAthletes(
  query: string,
  leagues: EspnSearchFilter[],
): Promise<any[]> {
  if (!leagues.length) return espnGlobalSearchAthletes(query);
  const merged: any[] = [];
  const seen = new Set<string>();
  for (const league of leagues) {
    for (const hit of await espnGlobalSearchAthletes(query, league)) {
      const id = String(hit?.athlete?.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(hit);
    }
  }
  return merged.slice(0, 12);
}

/**
 * Prefer ESPN global search (league `athletes?search=` often 400s).
 * Falls back to league endpoint when global returns nothing.
 */
export async function espnSearchAthletesWithFallback(
  query: string,
  filter: EspnSearchFilter,
  leagueSearchUrl?: string,
): Promise<any[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const global = await espnCoreSearchAthletes(trimmed, [filter]);
  if (global.length) return global;

  if (!leagueSearchUrl) return [];

  const data = await fetchJsonResilient<any>(
    leagueSearchUrl,
    undefined,
    { label: `espn-league-search-${filter.label}`, retries: 0, timeout: 8_000 },
  );
  return data?.items ?? data?.athletes ?? [];
}
