import {
  cacheKey,
  cachedFetch,
} from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import { fetchJsonResilient } from '../core/resilientFetch';
import { fetchEspnCustomScoreboardSelfPatch } from '../core/scoreboardSelfPatch';
import type { Game, StatItem } from '../../types';
import { parseGolfEvents, parseGolfCompetitor } from '../../services/parsers/parseGolfEvents';
import { dedupeGamesById } from '../core/mergeGames';
import { espnCoreSearchAthletes } from './espnCoreSearch';

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
    () => fetchEspnCustomScoreboardSelfPatch(`espn-golf-${label}`, base, dates),
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
  if (!playerId || !/^\d+$/.test(String(playerId))) return null;

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
      if (merged.length) return merged;

      return espnCoreSearchAthletes(query, [
        { sport: 'golf', league: 'pga', label: 'pga' },
        { sport: 'golf', league: 'lpga', label: 'lpga' },
      ]);
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

export interface GolfStatLeaderEntry {
  name: string;
  initials: string;
  nat: string;
  value: string;
}

export interface GolfStatLeaderCategory {
  label: string;
  icon: string;
  leaders: GolfStatLeaderEntry[];
}

const GOLF_STAT_ICONS: Record<string, string> = {
  scoringAverage: 'ph-target',
  yardsPerDrive: 'ph-lightning',
  greensInRegPct: 'ph-flag',
  strokesPerHole: 'ph-golf',
  birdiesPerRound: 'ph-bird',
  wins: 'ph-trophy',
  cupPoints: 'ph-star',
  driveAccuracyPct: 'ph-crosshair',
  officialAmount: 'ph-currency-dollar',
};

function golferInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export async function espnGolfLeaders(tour: 'PGA' | 'LPGA' = 'PGA'): Promise<unknown | null> {
  const slug = tour.toLowerCase();
  const key = cacheKey('espn-golf', slug, 'leaders');
  return cachedFetch(
    key,
    profileForResource('standings'),
    ({ bypassCache }) =>
      fetchJsonResilient<unknown>(
        `/api/espn/apis/site/v3/sports/golf/${slug}/leaders?limit=5`,
        undefined,
        { label: `espn-golf-${slug}-leaders`, retries: 2, bypassCache },
      ),
    ['standings', slug, 'leaders'],
  );
}

export function parseEspnGolfStatLeaders(data: unknown): GolfStatLeaderCategory[] | null {
  const categories = (data as { leaders?: { categories?: unknown[] } })?.leaders?.categories ?? [];
  if (!Array.isArray(categories) || !categories.length) return null;

  const labelOverrides: Record<string, string> = {
    scoringAverage: 'Scoring Average',
    yardsPerDrive: 'Driving Distance',
    strokesPerHole: 'Putts Per Hole',
    greensInRegPct: 'Greens in Regulation',
    cupPoints: 'FedEx Cup Points',
    officialAmount: 'Money List',
    driveAccuracyPct: 'Driving Accuracy',
  };

  const preferred = [
    'scoringAverage',
    'yardsPerDrive',
    'greensInRegPct',
    'strokesPerHole',
    'birdiesPerRound',
    'wins',
    'cupPoints',
    'driveAccuracyPct',
    'officialAmount',
  ];

  const mapped: GolfStatLeaderCategory[] = [];

  for (const key of preferred) {
    const cat = categories.find((c: { name?: string }) => c.name === key) as {
      displayName?: string;
      name?: string;
      leaders?: Array<{
        displayValue?: string;
        value?: string | number;
        athlete?: {
          displayName?: string;
          citizenship?: string;
          flag?: { alt?: string };
        };
      }>;
    } | undefined;
    if (!cat?.leaders?.length) continue;

    mapped.push({
      label: labelOverrides[key] ?? cat.displayName ?? cat.name ?? key,
      icon: GOLF_STAT_ICONS[key] ?? 'ph-chart-bar',
      leaders: cat.leaders.slice(0, 5).map((l) => {
        const name = l.athlete?.displayName ?? '—';
        return {
          name,
          initials: golferInitials(name),
          nat: l.athlete?.citizenship ?? l.athlete?.flag?.alt ?? 'INT',
          value: String(l.displayValue ?? l.value ?? '—'),
        };
      }),
    });
  }

  return mapped.length ? mapped : null;
}
