import {
  cacheKey,
  cachedFetch,
} from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import { fetchJsonResilient, sleep } from '../core/resilientFetch';
import { fetchEspnCustomScoreboardSelfPatch } from '../core/scoreboardSelfPatch';
import { getEngineRuntimeMode } from '../runtimeProfile';
import type { Game, StatItem } from '../../types';
import { parseTennisEvents } from '../../services/parsers/parseTennisEvents';
import { dedupeGamesById } from '../core/mergeGames';
import { resolveTennisAthleteAssets, isCountryFlagUrl } from '../../utils/fighterAssets';
import type { Team } from '../../types';

const ATP_BASE = '/api/espn/apis/site/v2/sports/tennis/atp';
const WTA_BASE = '/api/espn/apis/site/v2/sports/tennis/wta';
const ATP_COMMON = '/api/espn/apis/common/v3/sports/tennis/atp';
const WTA_COMMON = '/api/espn/apis/common/v3/sports/tennis/wta';

async function fetchTennisAthleteFrom(commonBase: string, playerId: string, label: string) {
  const [bio, overview, stats] = await Promise.all([
    fetchJsonResilient<any>(`${commonBase}/athletes/${playerId}`, undefined, {
      label: `${label}-athlete-${playerId}`,
    }),
    fetchJsonResilient<any>(`${commonBase}/athletes/${playerId}/overview`, undefined, {
      label: `${label}-overview-${playerId}`,
    }),
    fetchJsonResilient<any>(`${commonBase}/athletes/${playerId}/stats`, undefined, {
      label: `${label}-stats-${playerId}`,
    }),
  ]);
  if (!bio && !overview && !stats) return null;
  return { bio, overview, stats };
}

async function fetchTennisScoreboard(base: string, label: string): Promise<any | null> {
  const key = cacheKey('espn-tennis', label, 'today');
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    () => fetchEspnCustomScoreboardSelfPatch(`espn-tennis-${label}`, base),
    ['scoreboard', label],
  );
}

export async function espnAtpScoreboard(): Promise<any | null> {
  return fetchTennisScoreboard(ATP_BASE, 'atp');
}

export async function espnWtaScoreboard(): Promise<any | null> {
  return fetchTennisScoreboard(WTA_BASE, 'wta');
}

const WTA_EXTENSION_TIMEOUT_MS = 4_000;

async function fetchWtaScoreboardForMerge(): Promise<any | null> {
  const wtaFetch = espnWtaScoreboard();
  if (getEngineRuntimeMode() !== 'extension') return wtaFetch;
  return Promise.race([
    wtaFetch,
    sleep(WTA_EXTENSION_TIMEOUT_MS).then(() => null),
  ]);
}

export async function espnTennisMergedScoreboard(): Promise<{ events: any[]; atpEvents?: any[]; wtaEvents?: any[]; leagues?: unknown } | null> {
  const [atpResult, wtaResult] = await Promise.allSettled([
    espnAtpScoreboard(),
    fetchWtaScoreboardForMerge(),
  ]);
  const atp = atpResult.status === 'fulfilled' ? atpResult.value : null;
  const wta = wtaResult.status === 'fulfilled' ? wtaResult.value : null;
  const atpEvents = atp?.events ?? [];
  const wtaEvents = wta?.events ?? [];
  if (!atpEvents.length && !wtaEvents.length) return null;
  return {
    events: atpEvents,
    atpEvents,
    wtaEvents,
    leagues: atp?.leagues ?? wta?.leagues,
  };
}

export function parseTennisScoreboardEvents(raw: unknown): ReturnType<typeof parseTennisEvents> {
  const data = raw as { events?: any[]; atpEvents?: any[]; wtaEvents?: any[] };
  const games: ReturnType<typeof parseTennisEvents> = [];
  const atpEvents = data?.atpEvents ?? data?.events?.filter((e: any) =>
    !String(e.uid ?? '').includes('wta'),
  ) ?? data?.events ?? [];
  const wtaEvents = data?.wtaEvents ?? [];

  if (atpEvents.length) games.push(...parseTennisEvents(atpEvents, 'ATP'));
  if (wtaEvents.length) games.push(...parseTennisEvents(wtaEvents, 'WTA'));

  if (!games.length && data?.events?.length) {
    games.push(...parseTennisEvents(data.events, 'ATP'));
  }

  return dedupeGamesById(games);
}

export async function espnTennisAthlete(playerId: string, tour?: 'ATP' | 'WTA'): Promise<any | null> {
  const key = cacheKey('espn-tennis', 'athlete', tour ?? 'auto', playerId);
  return cachedFetch(
    key,
    profileForResource('athlete'),
    async () => {
      const bases = tour === 'WTA'
        ? [{ base: WTA_COMMON, label: 'espn-wta' }]
        : tour === 'ATP'
          ? [{ base: ATP_COMMON, label: 'espn-atp' }]
          : [
              { base: ATP_COMMON, label: 'espn-atp' },
              { base: WTA_COMMON, label: 'espn-wta' },
            ];

      for (const { base, label } of bases) {
        const result = await fetchTennisAthleteFrom(base, playerId, label);
        if (result) return result;
      }
      return null;
    },
    [`athlete:${playerId}`],
  );
}

export async function espnTennisSearchAthletes(query: string): Promise<any[]> {
  const key = cacheKey('espn-tennis', 'search', query);
  const result = await cachedFetch(
    key,
    profileForResource('search'),
    async () => {
      const [atp, wta] = await Promise.all([
        fetchJsonResilient<any>(`${ATP_COMMON}/athletes?search=${encodeURIComponent(query)}`, undefined, {
          label: `espn-atp-search-${query}`,
        }),
        fetchJsonResilient<any>(`${WTA_COMMON}/athletes?search=${encodeURIComponent(query)}`, undefined, {
          label: `espn-wta-search-${query}`,
        }),
      ]);
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const raw of [atp, wta]) {
        for (const item of raw?.items ?? raw?.athletes ?? []) {
          const id = String(item?.athlete?.id ?? item?.id ?? '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(item);
        }
      }
      return merged;
    },
    ['search'],
  );
  return result ?? [];
}

export async function espnTennisStandings(tour: 'ATP' | 'WTA' = 'ATP'): Promise<any | null> {
  const base = tour === 'WTA' ? WTA_BASE : ATP_BASE;
  const key = cacheKey('espn-tennis', 'standings', tour.toLowerCase());
  return cachedFetch(
    key,
    profileForResource('standings'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${base.replace('/site/v2/', '/v2/')}/standings`, undefined, {
        label: `espn-tennis-standings-${tour.toLowerCase()}`,
        bypassCache,
      }),
    ['standings', tour],
  );
}

export async function espnTennisMergedStandings(): Promise<{ atp: any | null; wta: any | null }> {
  const [atp, wta] = await Promise.all([
    espnTennisStandings('ATP'),
    espnTennisStandings('WTA'),
  ]);
  return { atp, wta };
}

export async function espnTennisMatchSummary(game: Game): Promise<any | null> {
  const [eventId] = game.id.split('-');
  if (!eventId) return espnTennisMergedScoreboard();

  const tour = game.sport === 'WTA' ? 'wta' : 'atp';
  const base = tour === 'wta' ? WTA_BASE : ATP_BASE;
  const key = cacheKey('espn-tennis', 'summary', tour, eventId);

  const summary = await cachedFetch(
    key,
    profileForResource('summary'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${base}/summary?event=${eventId}`, undefined, {
        label: `espn-tennis-summary-${eventId}`,
        retries: 1,
        timeout: 10_000,
        bypassCache,
      }),
    [`game:${game.id}`],
  );

  if (summary) return summary;
  return espnTennisMergedScoreboard();
}

export function findTennisMatchInScoreboard(raw: unknown, gameId: string): any | null {
  const data = raw as { events?: any[]; atpEvents?: any[]; wtaEvents?: any[] };
  const allEvents = [
    ...(data?.atpEvents ?? []),
    ...(data?.wtaEvents ?? []),
    ...(data?.events ?? []),
  ];
  const seen = new Set<string>();
  for (const event of allEvents) {
    const eventKey = String(event?.id ?? '');
    if (seen.has(eventKey)) continue;
    seen.add(eventKey);
    for (const grouping of event.groupings ?? []) {
      for (const competition of grouping.competitions ?? []) {
        const id = `${event.id}-${competition.id}`;
        if (id === gameId) {
          return { event, grouping, competition };
        }
      }
    }
  }
  return null;
}

function preserveCompetitorPortrait(existing: Team, refreshed: Team): Team {
  if (existing.logo && !isCountryFlagUrl(existing.logo)) {
    return {
      ...refreshed,
      logo: existing.logo,
      logoFallback: refreshed.flag ?? existing.logoFallback,
    };
  }
  return refreshed;
}

export function enrichTennisGameDetail(game: Game, raw: unknown): Partial<Game> {
  const match = findTennisMatchInScoreboard(raw, game.id);
  if (match) {
    const tour = game.sport
      ?? (String(match.event?.uid ?? '').includes('wta') ? 'WTA' : 'ATP');
    const refreshed = parseTennisEvents([match.event], tour);
    const found = refreshed.find((g) => g.id === game.id);
    if (found) {
      return {
        ...found,
        away: preserveCompetitorPortrait(game.away, found.away),
        home: preserveCompetitorPortrait(game.home, found.home),
        context: game.context ?? found.context,
      };
    }
  }

  const payload = raw as {
    header?: { competitions?: Array<{ competitors?: unknown[]; status?: unknown }> };
    competitions?: Array<{ competitors?: unknown[]; status?: unknown }>;
  };
  const summaryComp = payload.header?.competitions?.[0] ?? payload.competitions?.[0];
  if (summaryComp?.competitors?.length) {
    const tour = game.sport === 'WTA' ? 'WTA' : 'ATP';
    const fakeEvent = {
      id: game.id.split('-')[0],
      name: game.tournamentName,
      status: summaryComp.status,
      groupings: [{ competitions: [summaryComp] }],
    };
    const refreshed = parseTennisEvents([fakeEvent], tour);
    const found = refreshed.find((g) => g.id === game.id);
    if (!found) return {};
    return {
      ...found,
      away: preserveCompetitorPortrait(game.away, found.away),
      home: preserveCompetitorPortrait(game.home, found.home),
      context: game.context ?? found.context,
    };
  }

  return {};
}

export function parseEspnTennisTeamStats(summary: any): { away: StatItem[]; home: StatItem[] } | undefined {
  const comp = summary?.competition
    ?? summary?.header?.competitions?.[0]
    ?? findTennisMatchInScoreboard(summary, summary?.gameId)?.competition;
  if (!comp?.competitors?.length) return undefined;

  const sorted = [...comp.competitors].sort(
    (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
  );
  if (sorted.length < 2) return undefined;

  const mapStats = (c: any): StatItem[] =>
    (c?.statistics ?? [])
      .filter((s: any) => s.displayValue !== undefined)
      .map((s: any) => ({
        label: s.abbreviation || s.name || s.displayName,
        value: s.displayValue,
      }))
      .slice(0, 10);

  const away = mapStats(sorted[0]);
  const home = mapStats(sorted[1]);
  if (!away.length && !home.length) return undefined;
  return { away, home };
}

export function parseEspnTennisGameMeta(summary: any) {
  const comp = summary?.competition ?? summary?.header?.competitions?.[0] ?? summary;
  return {
    venue: comp?.venue?.fullName ?? summary?.event?.venue?.displayName ?? summary?.header?.venue?.fullName,
    broadcast: comp?.broadcasts?.[0]?.names?.join(', ') ?? summary?.header?.broadcasts?.[0]?.names?.join(', '),
    attendance: comp?.attendance ? String(comp.attendance) : undefined,
  };
}

export function parseEspnTennisTopPerformers(summary: any): Array<{
  id: string;
  name: string;
  team: string;
  position: string;
  headshot?: string;
  stats: StatItem[];
}> {
  const competitors = summary?.competition?.competitors ?? [];
  return competitors.map((comp: any) => {
    const athlete = comp.athlete ?? {};
    const stats: StatItem[] = (comp.statistics ?? [])
      .filter((s: any) => s.displayValue !== undefined)
      .slice(0, 4)
      .map((s: any) => ({
        label: s.abbreviation || s.name,
        value: s.displayValue,
      }));
    const { headshot, flag } = resolveTennisAthleteAssets(comp);
    return {
      id: String(comp.id ?? athlete.id ?? athlete.displayName ?? 'unknown'),
      name: athlete.displayName ?? 'Unknown',
      team: athlete.flag?.abbreviation ?? '—',
      position: '—',
      headshot: headshot ?? flag,
      stats,
    };
  });
}

export function parseEspnTennisRoster(): Array<{ id: string; name: string; position: string }> {
  return [];
}
