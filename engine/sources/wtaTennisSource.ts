import { externalFetchUrl } from '../../config/siyfApi';
import type { Game, Team } from '../../types';
import { isCountryFlagUrl, isPlaceholderCompetitor } from '../../utils/fighterAssets';
import { cacheKey, cachedFetch } from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import { fetchJsonResilient } from '../core/resilientFetch';

const WTA_TENNIS_API = 'https://api.wtatennis.com/tennis';
export const WTA_HEADSHOT_CDN = 'https://wtafiles.blob.core.windows.net/images/headshots';

export function slugifyWtaPlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Canonical profile page, e.g. https://www.wtatennis.com/players/322534/kayla-day */
export function buildWtaPlayerProfileUrl(playerId: string | number, name: string): string {
  return `https://www.wtatennis.com/players/${playerId}/${slugifyWtaPlayerName(name)}`;
}

export function buildWtaHeadshotUrl(playerId: string | number): string {
  return `${WTA_HEADSHOT_CDN}/${playerId}.jpg`;
}

interface WtaPlayerRecord {
  id: number;
  fullName: string;
  firstName?: string;
  lastName?: string;
  countryCode?: string;
}

interface WtaPlayersResponse {
  pageInfo?: { numEntries?: number };
  content?: WtaPlayerRecord[];
}

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a WTA player id via the public tennis API.
 * Example: name "Kayla Day" → id 322534 (profile /players/322534/kayla-day).
 */
export async function lookupWtaPlayerByName(name: string): Promise<WtaPlayerRecord | null> {
  const trimmed = name.trim();
  if (!trimmed || isPlaceholderCompetitor({ name: trimmed })) return null;

  const key = cacheKey('wta-tennis', 'player', normalizePlayerName(trimmed));
  return cachedFetch(
    key,
    profileForResource('search'),
    async () => {
      const url = externalFetchUrl(
        `${WTA_TENNIS_API}/players?name=${encodeURIComponent(trimmed)}`,
      );
      const data = await fetchJsonResilient<WtaPlayersResponse>(url, undefined, {
        label: `wta-player-lookup-${trimmed}`,
        retries: 1,
        throwOnTransientError: true,
      });
      if (!data?.content?.length) return null;

      const target = normalizePlayerName(trimmed);
      const exact = data.content.find((p) => normalizePlayerName(p.fullName || '') === target);
      if (exact) return exact;
      if (data.pageInfo?.numEntries === 1) return data.content[0] ?? null;
      return null;
    },
    [`wta-player:${normalizePlayerName(trimmed)}`],
  );
}

export async function resolveWtaHeadshot(name: string): Promise<string | undefined> {
  const player = await lookupWtaPlayerByName(name);
  if (!player?.id) return undefined;
  return buildWtaHeadshotUrl(player.id);
}

/** Limit parallel WTA API lookups — burst fan-out triggers upstream 503s. */
const WTA_HEADSHOT_LOOKUP_CONCURRENCY = 3;

function needsWtaHeadshot(team: Team): boolean {
  if (isPlaceholderCompetitor(team)) return false;
  if (team.logo && !isCountryFlagUrl(team.logo)) return false;
  return true;
}

function applyWtaHeadshot(team: Team, headshot: string | undefined): Team {
  if (!headshot) return team;
  return { ...team, logo: headshot, logoFallback: team.flag ?? team.logoFallback };
}

/** Attach WTA headshots to WTA tour games (flags stay as fallback). */
export async function enrichWtaTennisHeadshots(games: Game[]): Promise<Game[]> {
  if (!games.some((g) => g.sport === 'WTA')) return games;

  const names = new Set<string>();
  for (const game of games) {
    if (game.sport !== 'WTA') continue;
    if (needsWtaHeadshot(game.away)) names.add(game.away.name);
    if (needsWtaHeadshot(game.home)) names.add(game.home.name);
  }

  const headshots = new Map<string, string | undefined>();
  const queue = [...names];

  for (let i = 0; i < queue.length; i += WTA_HEADSHOT_LOOKUP_CONCURRENCY) {
    const batch = queue.slice(i, i + WTA_HEADSHOT_LOOKUP_CONCURRENCY);
    await Promise.all(
      batch.map(async (name) => {
        try {
          headshots.set(name, await resolveWtaHeadshot(name));
        } catch {
          // Transient proxy/WTA errors — skip headshot this pass (no negative cache).
        }
      }),
    );
  }

  return games.map((game) => {
    if (game.sport !== 'WTA') return game;
    const away = needsWtaHeadshot(game.away)
      ? applyWtaHeadshot(game.away, headshots.get(game.away.name))
      : game.away;
    const home = needsWtaHeadshot(game.home)
      ? applyWtaHeadshot(game.home, headshots.get(game.home.name))
      : game.home;
    if (away === game.away && home === game.home) return game;
    return { ...game, away, home };
  });
}
