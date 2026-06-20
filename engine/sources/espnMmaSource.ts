import {
  cacheKey,
  cachedFetch,
  cacheGet,
  cacheGetStale,
  cacheSetWithProfile,
} from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import { fetchJsonResilient } from '../core/resilientFetch';
import { fetchEspnCustomScoreboardSelfPatch } from '../core/scoreboardSelfPatch';
import type { Game, StatItem } from '../../types';
import type { StandingsGroup } from '../core/types';
import { parseFightEvents } from '../../services/parsers/parseFightEvents';
import { resolveFightOrgSlug, tagUfcGames } from '../../services/parsers/parseFightContext';
import { resolveMmaFighterAssets } from '../../utils/fighterAssets';
import { espnSearchAthletesWithFallback } from './espnCoreSearch';

const MMA_BASE = '/api/espn/apis/site/v2/sports/mma';
const MMA_COMMON = '/api/espn/apis/common/v3/sports/mma/athletes';
const CORE_MMA = '/api/espn-core/v2/sports/mma';
const CORE_UFC = `${CORE_MMA}/leagues/ufc`;

const UFC_RANKING_SLUGS = [
  'pound-for-pound',
  'flyweight',
  'bantamweight',
  'featherweight',
  'lightweight',
  'welterweight',
  'middleweight',
  'light-heavyweight',
  'heavyweight',
] as const;

interface MmaAthleteProfile {
  name: string;
  nat: string;
  record: string;
}

function athleteIdFromRef(ref?: string): string | null {
  if (!ref) return null;
  const match = ref.match(/\/athletes\/(\d+)/);
  return match?.[1] ?? null;
}

function natFromAthlete(athlete: any): string {
  const abbr = athlete?.citizenshipCountry?.abbreviation;
  if (typeof abbr === 'string' && abbr.length >= 2) return abbr.toUpperCase();
  const flagMatch = athlete?.flag?.href?.match(/\/([a-z]{3})\.png/i);
  if (flagMatch) return flagMatch[1].toUpperCase();
  const alt = athlete?.flag?.alt ?? athlete?.citizenship ?? '';
  return String(alt).slice(0, 3).toUpperCase() || '--';
}

function parseRecordSummary(summary?: string): { wins: number; losses: number } {
  const [w, l] = String(summary ?? '0-0').split('-').map((part) => parseInt(part, 10));
  return { wins: Number.isFinite(w) ? w : 0, losses: Number.isFinite(l) ? l : 0 };
}

async function fetchMmaCoreAthlete(id: string, bypassCache = false): Promise<any | null> {
  return fetchJsonResilient<any>(`${CORE_MMA}/athletes/${id}`, undefined, {
    label: `espn-mma-core-athlete-${id}`,
    retries: 1,
    bypassCache,
  });
}

async function fetchMmaCoreAthleteRecord(id: string, bypassCache = false): Promise<string> {
  const data = await fetchJsonResilient<any>(`${CORE_MMA}/athletes/${id}/records`, undefined, {
    label: `espn-mma-core-records-${id}`,
    retries: 1,
    bypassCache,
  });
  const items = data?.items ?? [];
  const overall = items.find((item: any) => /overall|total/i.test(item?.type ?? item?.name ?? ''));
  return overall?.summary ?? overall?.displayValue ?? items[0]?.summary ?? '—';
}

async function fetchMmaAthleteProfiles(ids: string[]): Promise<Map<string, MmaAthleteProfile>> {
  const profiles = new Map<string, MmaAthleteProfile>();
  await Promise.all(ids.map(async (id) => {
    const key = cacheKey('espn-mma', 'profile', id);
    const cached = cacheGet<MmaAthleteProfile>(key);
    if (cached) {
      profiles.set(id, cached);
      return;
    }

    const [athlete, record] = await Promise.all([
      fetchMmaCoreAthlete(id),
      fetchMmaCoreAthleteRecord(id),
    ]);
    if (!athlete) return;

    const profile: MmaAthleteProfile = {
      name: athlete.displayName ?? athlete.fullName ?? 'Unknown',
      nat: natFromAthlete(athlete),
      record,
    };
    cacheSetWithProfile(key, profile, profileForResource('athlete'), [`athlete:${id}`]);
    profiles.set(id, profile);
  }));
  return profiles;
}

function rankingGroupName(payload: any, slug: string): string {
  if (/pound-for-pound/i.test(slug)) return "Men's Pound-for-Pound";
  return payload?.weightClass?.text
    ?? payload?.shortName?.replace(/\s*Division Rankings.*$/i, '').trim()
    ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapUfcRankingPayload(payload: any, slug: string, profiles: Map<string, MmaAthleteProfile>): StandingsGroup {
  const rows = (payload?.ranks ?? []).map((rank: any, idx: number) => {
    const id = athleteIdFromRef(rank?.athlete?.$ref);
    const profile = id ? profiles.get(id) : undefined;
    const { wins, losses } = parseRecordSummary(profile?.record);
    const trend = rank?.trend && rank.trend !== '-' ? `${rank.trend} rank` : undefined;

    return {
      rank: rank?.current ?? idx + 1,
      team: {
        id: id ?? String(idx),
        name: profile?.name ?? 'Unknown',
        abbr: profile?.nat ?? '--',
        city: '',
        logo: '',
        subtitle: payload?.weightClass?.text,
      },
      wins,
      losses,
      winPct: profile?.record ?? '—',
      streak: trend,
      gamesBack: rank?.hasAccolade ? 'C' : undefined,
    };
  });

  return { name: rankingGroupName(payload, slug), rows };
}

export async function espnUfcStandings(): Promise<StandingsGroup[]> {
  const key = cacheKey('espn-mma', 'standings', 'ufc');
  const cached = cacheGet<StandingsGroup[]>(key);
  if (cached?.length) return cached;

  const payloads = await Promise.all(
    UFC_RANKING_SLUGS.map((slug) =>
      fetchJsonResilient<any>(`${CORE_UFC}/rankings/${slug}`, undefined, {
        label: `espn-mma-rankings-${slug}`,
        retries: 1,
      }).catch(() => null),
    ),
  );

  const athleteIds = new Set<string>();
  for (const payload of payloads) {
    for (const rank of payload?.ranks ?? []) {
      const id = athleteIdFromRef(rank?.athlete?.$ref);
      if (id) athleteIds.add(id);
    }
  }

  if (!athleteIds.size) return cacheGetStale<StandingsGroup[]>(key) ?? [];

  const profiles = await fetchMmaAthleteProfiles([...athleteIds]);
  const groups = payloads
    .map((payload, idx) => (payload ? mapUfcRankingPayload(payload, UFC_RANKING_SLUGS[idx], profiles) : null))
    .filter((group): group is StandingsGroup => Boolean(group?.rows?.length));

  if (groups.length) {
    cacheSetWithProfile(key, groups, profileForResource('standings'), ['standings', 'ufc']);
  }
  return groups.length ? groups : cacheGetStale<StandingsGroup[]>(key) ?? [];
}

export async function espnMmaScoreboard(slug: string): Promise<any | null> {
  const key = cacheKey('espn-mma', slug, 'today');
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    () => fetchEspnCustomScoreboardSelfPatch(`espn-mma-${slug}`, `${MMA_BASE}/${slug}`),
    ['scoreboard', slug],
  );
}

export async function espnUfcScoreboard(): Promise<any | null> {
  return espnMmaScoreboard('ufc');
}

export async function espnFightEventSummary(game: Game): Promise<any | null> {
  const slug = resolveFightOrgSlug(game);
  return espnMmaScoreboard(slug);
}

export function parseFightScoreboardEvents(raw: unknown): ReturnType<typeof parseFightEvents> {
  const data = raw as { events?: any[] };
  return tagUfcGames(parseFightEvents(data?.events ?? [], 'UFC'));
}

export async function espnMmaAthlete(playerId: string): Promise<any | null> {
  const key = cacheKey('espn-mma', 'athlete', playerId);
  return cachedFetch(
    key,
    profileForResource('athlete'),
    async ({ bypassCache }) => {
      const opts = { bypassCache };
      const [bio, overview] = await Promise.all([
        fetchJsonResilient<any>(`${MMA_COMMON}/${playerId}`, undefined, {
          label: `espn-mma-athlete-${playerId}`,
          ...opts,
        }),
        fetchJsonResilient<any>(`${MMA_COMMON}/${playerId}/overview`, undefined, {
          label: `espn-mma-overview-${playerId}`,
          ...opts,
        }),
      ]);
      if (!bio && !overview) return null;
      return { bio, overview, stats: null };
    },
    [`athlete:${playerId}`],
  );
}

export async function espnMmaSearchAthletes(query: string): Promise<any[]> {
  const key = cacheKey('espn-mma', 'search', query);
  const encoded = encodeURIComponent(query.trim());
  const result = await cachedFetch(
    key,
    profileForResource('search'),
    async () =>
      espnSearchAthletesWithFallback(
        query,
        { sport: 'mma', label: 'mma' },
        `${MMA_COMMON}?search=${encoded}&limit=10`,
      ),
    ['search'],
  );
  return result ?? [];
}

export function parseEspnMmaGameMeta(summary: any) {
  const event = summary?.events?.[0] ?? summary;
  return {
    venue: event?.venue?.fullName ?? event?.venue?.displayName,
    broadcast: event?.broadcasts?.[0]?.names?.join(', ') ?? event?.broadcast,
    attendance: undefined,
  };
}

export function parseEspnMmaTopPerformers(summary: any): Array<{
  name: string;
  team: string;
  position: string;
  headshot?: string;
  stats: StatItem[];
}> {
  const event = summary?.events?.[0];
  const competition = event?.competitions?.[0];
  if (!competition) return [];

  return (competition.competitors ?? []).map((comp: any) => {
    const athlete = comp.athlete ?? {};
    const { headshot, flag } = resolveMmaFighterAssets(comp);
    return {
      name: athlete.displayName ?? 'Unknown',
      team: athlete.flag?.alt ?? '—',
      position: comp.winner ? 'Winner' : 'Fighter',
      headshot: headshot ?? flag,
      stats: [{ label: 'Record', value: comp.records?.[0]?.summary ?? '—' }],
    };
  });
}

export function parseEspnMmaRoster(): Array<{ id: string; name: string; position: string }> {
  return [];
}
