import {
  cacheKey,
  cachedFetch,
} from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import { fetchJsonResilient } from '../core/resilientFetch';
import type { Game, StatItem } from '../../types';
import { parseFightEvents } from '../../services/parsers/parseFightEvents';
import { resolveFightOrgSlug, tagUfcGames } from '../../services/parsers/parseFightContext';
import { resolveMmaFighterAssets } from '../../utils/fighterAssets';
import { espnSearchAthletesWithFallback } from './espnCoreSearch';

const MMA_BASE = '/api/espn/apis/site/v2/sports/mma';
const MMA_COMMON = '/api/espn/apis/common/v3/sports/mma/athletes';

export async function espnMmaScoreboard(slug: string): Promise<any | null> {
  const key = cacheKey('espn-mma', slug, 'today');
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    ({ bypassCache }) =>
      fetchJsonResilient<any>(`${MMA_BASE}/${slug}/scoreboard`, undefined, {
        label: `espn-mma-${slug}-scoreboard`,
        retries: 2,
        bypassCache,
      }),
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
