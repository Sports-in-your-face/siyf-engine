import {
  cacheKey,
  cachedFetch,
} from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import { fetchJsonResilient } from '../core/resilientFetch';
import type { Game, StatItem } from '../../types';
import { parseGolfEvents, parseGolfCompetitor } from '../../services/parsers/parseGolfEvents';
import { dedupeGamesById } from '../core/mergeGames';

const PGA_BASE = '/api/espn/apis/site/v2/sports/golf/pga';
const LPGA_BASE = '/api/espn/apis/site/v2/sports/golf/lpga';
const PGA_COMMON = '/api/espn/apis/common/v3/sports/golf/pga';
const LPGA_COMMON = '/api/espn/apis/common/v3/sports/golf/lpga';

async function fetchGolfAthleteFrom(commonBase: string, playerId: string, label: string) {
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

async function fetchScoreboard(base: string, label: string, dates?: string): Promise<any | null> {
  const key = cacheKey('espn-golf', label, dates ?? 'today');
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    ({ bypassCache }) => {
      const url = dates ? `${base}/scoreboard?dates=${dates}` : `${base}/scoreboard`;
      return fetchJsonResilient<any>(url, undefined, { label, retries: 2, bypassCache });
    },
    ['scoreboard', label],
  );
}

export async function espnPgaScoreboard(dates?: string): Promise<any | null> {
  return fetchScoreboard(PGA_BASE, 'pga', dates);
}

export async function espnLpgaScoreboard(dates?: string): Promise<any | null> {
  return fetchScoreboard(LPGA_BASE, 'lpga', dates);
}

export async function espnGolfMergedScoreboard(): Promise<{ events: any[]; lpgaEvents?: any[]; leagues?: unknown } | null> {
  const [pga, lpga] = await Promise.all([
    espnPgaScoreboard(),
    espnLpgaScoreboard(),
  ]);
  const events = pga?.events ?? [];
  const lpgaEvents = lpga?.events ?? [];
  if (!events.length && !lpgaEvents.length) return null;
  return { events, lpgaEvents, leagues: pga?.leagues ?? lpga?.leagues };
}

export function parseGolfScoreboardEvents(raw: unknown): ReturnType<typeof parseGolfEvents> {
  const data = raw as { events?: any[] };
  const games = [...parseGolfEvents(data?.events ?? [], 'PGA')];
  const lpgaEvents = (raw as { lpgaEvents?: any[] })?.lpgaEvents;
  if (lpgaEvents?.length) games.push(...parseGolfEvents(lpgaEvents, 'LPGA'));
  return dedupeGamesById(games);
}

export async function espnGolfAthlete(playerId: string, tour?: 'PGA' | 'LPGA'): Promise<any | null> {
  const key = cacheKey('espn-golf', 'athlete', tour ?? 'auto', playerId);
  return cachedFetch(
    key,
    profileForResource('athlete'),
    async ({ bypassCache: _bypassCache }) => {
      const bases = tour === 'LPGA'
        ? [{ base: LPGA_COMMON, label: 'espn-lpga' }]
        : tour === 'PGA'
          ? [{ base: PGA_COMMON, label: 'espn-pga' }]
          : [
              { base: PGA_COMMON, label: 'espn-pga' },
              { base: LPGA_COMMON, label: 'espn-lpga' },
            ];

      for (const { base, label } of bases) {
        const result = await fetchGolfAthleteFrom(base, playerId, label);
        if (result) return result;
      }
      return null;
    },
    [`athlete:${playerId}`],
  );
}

export async function espnGolfSearchAthletes(query: string): Promise<any[]> {
  const key = cacheKey('espn-golf', 'search', query);
  const result = await cachedFetch(
    key,
    profileForResource('search'),
    async () => {
      const [pga, lpga] = await Promise.all([
        fetchJsonResilient<any>(`${PGA_COMMON}/athletes?search=${encodeURIComponent(query)}`, undefined, {
          label: `espn-pga-search-${query}`,
        }),
        fetchJsonResilient<any>(`${LPGA_COMMON}/athletes?search=${encodeURIComponent(query)}`, undefined, {
          label: `espn-lpga-search-${query}`,
        }),
      ]);
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const raw of [pga, lpga]) {
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

export async function espnGolfStandings(tour: 'PGA' | 'LPGA' = 'PGA'): Promise<any | null> {
  const base = tour === 'LPGA' ? LPGA_BASE : PGA_BASE;
  const key = cacheKey('espn-golf', 'standings', tour.toLowerCase());
  return cachedFetch(
    key,
    profileForResource('standings'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${base.replace('/site/v2/', '/v2/')}/standings`, undefined, {
        label: `espn-golf-standings-${tour.toLowerCase()}`,
        bypassCache,
      }),
    ['standings', tour],
  );
}

export async function espnGolfMergedStandings(): Promise<{ pga: any | null; lpga: any | null }> {
  const [pga, lpga] = await Promise.all([
    espnGolfStandings('PGA'),
    espnGolfStandings('LPGA'),
  ]);
  return { pga, lpga };
}

export async function espnGolfEventSummary(eventId: string, tour: 'PGA' | 'LPGA' = 'PGA'): Promise<any | null> {
  const base = tour === 'LPGA' ? LPGA_BASE : PGA_BASE;
  const key = cacheKey('espn-golf', 'summary', tour.toLowerCase(), eventId);
  return cachedFetch(
    key,
    profileForResource('summary'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${base}/summary?event=${eventId}`, undefined, {
        label: `espn-golf-summary-${tour.toLowerCase()}-${eventId}`,
        retries: 1,
        timeout: 10_000,
        bypassCache,
      }),
    [`game:${eventId}`],
  );
}

export function enrichGolfGameDetail(game: Game, raw: unknown): Partial<Game> {
  const payload = raw as { header?: { competitions?: Array<{ competitors?: unknown[] }> }; competitions?: Array<{ competitors?: unknown[] }> };
  const event = payload?.header ?? (raw as { competitions?: Array<{ competitors?: unknown[] }> });
  if (!event?.competitions?.[0]?.competitors?.length) return {};
  const refreshed = parseGolfEvents([event], game.sport ?? 'PGA');
  return refreshed.find((g) => g.id === game.id) ?? {};
}

export function parseEspnGolfGameMeta(summary: any) {
  const event = summary?.header ?? summary;
  return {
    venue: event?.venue?.fullName ?? event?.courses?.[0]?.name,
    broadcast: event?.broadcasts?.[0]?.names?.join(', ') ?? summary?.broadcasts?.[0]?.names?.join(', '),
    attendance: event?.attendance ? String(event.attendance) : undefined,
  };
}

export function parseEspnGolfTeamStats(summary: any): { away: StatItem[]; home: StatItem[] } | undefined {
  const header = summary?.header ?? summary;
  const course = header?.courses?.[0] ?? summary?.courses?.[0];
  const comp = header?.competitions?.[0] ?? summary?.competitions?.[0];
  const notes = comp?.notes ?? header?.notes ?? [];

  const tournamentStats: StatItem[] = [];
  if (course?.par) tournamentStats.push({ label: 'Par', value: String(course.par) });
  if (course?.yardage) tournamentStats.push({ label: 'Yardage', value: String(course.yardage) });
  if (course?.totalYards) tournamentStats.push({ label: 'Yards', value: String(course.totalYards) });

  const cutNote = notes.find((n: any) => /cut/i.test(n.headline ?? n.text ?? ''));
  if (cutNote?.headline) tournamentStats.push({ label: 'Cut', value: cutNote.headline.replace(/^cut:\s*/i, '').slice(0, 20) });

  const fieldSize = comp?.competitors?.length ?? header?.competitions?.[0]?.competitors?.length;
  if (fieldSize) tournamentStats.push({ label: 'Field', value: String(fieldSize) });

  const purse = header?.purse ?? comp?.purse;
  if (purse) tournamentStats.push({ label: 'Purse', value: typeof purse === 'number' ? `$${(purse / 1_000_000).toFixed(1)}M` : String(purse) });

  const statusDetail = header?.status?.type?.detail ?? comp?.status?.type?.detail;
  if (statusDetail) tournamentStats.push({ label: 'Status', value: statusDetail });

  if (!tournamentStats.length) return undefined;

  const leaderStats: StatItem[] = [];
  const leader = comp?.competitors?.find((c: any) => c.order === 1) ?? comp?.competitors?.[0];
  if (leader) {
    const entry = parseGolfCompetitor(leader);
    leaderStats.push(
      { label: 'Leader', value: entry.name },
      { label: 'Score', value: entry.toPar ?? entry.score },
      { label: 'Thru', value: entry.thru ?? '—' },
    );
    if (entry.linescores?.length) {
      entry.linescores.forEach((r, i) => leaderStats.push({ label: `R${i + 1}`, value: String(r) }));
    }
  }

  return {
    away: leaderStats.length ? leaderStats : tournamentStats.slice(0, 6),
    home: tournamentStats,
  };
}

export function parseEspnGolfTopPerformers(summary: any): Array<{
  id: string;
  name: string;
  team: string;
  position: string;
  headshot?: string;
  stats: StatItem[];
}> {
  const competitors = summary?.competitions?.[0]?.competitors
    ?? summary?.header?.competitions?.[0]?.competitors
    ?? [];

  return [...competitors]
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .slice(0, 10)
    .map((comp: any) => {
      const athlete = comp.athlete ?? {};
      const entry = parseGolfCompetitor(comp);
      const stats: StatItem[] = [
        { label: 'POS', value: String(comp.order ?? '—') },
        { label: 'TOT', value: entry.score },
        { label: 'TO PAR', value: entry.toPar ?? '—' },
      ];
      if (entry.thru) stats.push({ label: 'THRU', value: entry.thru });
      entry.linescores?.forEach((r, i) => stats.push({ label: `R${i + 1}`, value: String(r) }));

      return {
        id: String(comp.id ?? athlete.id ?? athlete.displayName ?? 'unknown'),
        name: athlete.displayName ?? 'Unknown',
        team: athlete.flag?.alt ?? athlete.citizenship ?? '—',
        position: '—',
        headshot: athlete.flag?.href ?? athlete.headshot?.href,
        stats,
      };
    });
}

export function parseEspnGolfRoster(): Array<{ id: string; name: string; position: string }> {
  return [];
}
