import { siyfApiUrl } from '../../config/siyfApi';
import { fetchJsonResilient } from '../core/resilientFetch';
import { fetchCachedPaidOdds } from '../core/cachedOddsFetch';
import { cacheGet, cacheKey, cacheSet } from '../core/cache';
import type { Player, PlayerDetails } from '../../types';

interface SleeperPlayer {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  team?: string;
  position?: string;
  number?: number;
  height?: string;
  weight?: string;
  injury_status?: string;
  injury_body_part?: string;
  fantasy_positions?: string[];
  years_exp?: number;
}

let sleeperCache: Record<string, SleeperPlayer> | null = null;

async function loadSleeperPlayers(): Promise<Record<string, SleeperPlayer>> {
  if (sleeperCache) return sleeperCache;
  const key = cacheKey('sleeper', 'nba-players');
  const cached = cacheGet<Record<string, SleeperPlayer>>(key);
  if (cached) {
    sleeperCache = cached;
    return cached;
  }
  const raw = await fetchJsonResilient<Record<string, SleeperPlayer>>(
    'https://api.sleeper.app/v1/players/nba',
    undefined,
    { label: 'sleeper-players', retries: 2, timeout: 15_000 },
  );
  if (!raw) return {};
  sleeperCache = raw;
  cacheSet(key, raw, 3_600_000, 86_400_000);
  return raw;
}

function findSleeperPlayer(players: Record<string, SleeperPlayer>, player: Player): SleeperPlayer | null {
  const byId = players[player.id];
  if (byId) return byId;
  const lower = player.name.toLowerCase();
  for (const p of Object.values(players)) {
    if (p.full_name?.toLowerCase() === lower) return p;
  }
  return null;
}

export async function fetchSleeperPlayerDetail(player: Player): Promise<Partial<PlayerDetails> | null> {
  const all = await loadSleeperPlayers();
  const match = findSleeperPlayer(all, player);
  if (!match) return null;

  const injuryStatus =
    match.injury_status && match.injury_status !== 'Healthy'
      ? `${match.injury_status}${match.injury_body_part ? ` (${match.injury_body_part})` : ''}`
      : undefined;

  return {
    number: match.number != null ? String(match.number) : undefined,
    height: match.height ?? undefined,
    weight: match.weight != null ? String(match.weight) : undefined,
    injuryStatus,
  };
}

export async function fetchDraftKingsProps(player: Player): Promise<Partial<PlayerDetails> | null> {
  const proxyBase = siyfApiUrl('/api/odds');

  const raw = await fetchCachedPaidOdds<any>(
    'nba-events',
    `${proxyBase}/sports/basketball_nba/events`,
    'dk-events',
    ['nba', 'events'],
  );
  if (!raw.length) return null;

  const lastName = player.name.split(' ').pop()?.toLowerCase() ?? '';
  for (const event of raw) {
    const markets = event.bookmakers ?? [];
    for (const book of markets) {
      if (!/draftkings/i.test(book.key ?? book.title ?? '')) continue;
      for (const market of book.markets ?? []) {
        for (const outcome of market.outcomes ?? []) {
          if (String(outcome.description ?? outcome.name ?? '').toLowerCase().includes(lastName)) {
            return {
              seasonSplits: [{
                name: 'DraftKings Props',
                stats: [{ label: market.key ?? 'Prop', value: outcome.price ?? outcome.point ?? '—' }],
              }],
            };
          }
        }
      }
    }
  }
  return null;
}

// DraftKings props use the paid Odds API — wired per-sport with lastResort: true (see basketball config).
