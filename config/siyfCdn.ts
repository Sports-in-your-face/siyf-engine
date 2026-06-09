/** nicholasxdavis/siyf-cdn via jsDelivr — logos, teams, stats, favicons. */
function readCdnBase(): string {
  const fromProcess = typeof process !== 'undefined' ? process.env.SIYF_CDN_URL : undefined;
  const fromVite = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SIYF_CDN_URL : undefined;
  return fromProcess ?? fromVite ?? 'https://cdn.jsdelivr.net/gh/nicholasxdavis/siyf-cdn@main';
}

export const SIYF_CDN_BASE = readCdnBase();

export function cdnUrl(path: string): string {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `${SIYF_CDN_BASE}/${normalized}`;
}

/** Resolve a path stored in CDN JSON (relative) or pass through full URLs. */
export function resolveCdnAsset(stored: string | undefined | null): string {
  if (!stored) return '';
  if (stored.startsWith('http://') || stored.startsWith('https://')) return stored;
  if (stored.startsWith('media/') || stored.startsWith('meta/') || stored.startsWith('teams/') || stored.startsWith('stats/')) {
    return cdnUrl(stored);
  }
  return stored;
}

export function cdnLogo(sport: string, abbr: string): string {
  return cdnUrl(`media/logos/${sport}/${abbr.toLowerCase()}.png`);
}

export function cdnFavicon(name: string): string {
  return cdnUrl(`favicon/${name}`);
}

const jsonCache = new Map<string, unknown>();

export async function fetchCdnJson<T>(path: string): Promise<T> {
  const url = cdnUrl(path);
  if (jsonCache.has(url)) return jsonCache.get(url) as T;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`CDN fetch failed (${res.status}): ${url}`);

  const data = (await res.json()) as T;
  jsonCache.set(url, data);
  return data;
}

export function clearCdnCache(): void {
  jsonCache.clear();
}

export interface CdnManifest {
  version: number;
  syncedAt: string;
  sports?: { sport: string; teams: number }[];
}

export async function fetchCdnManifest(): Promise<CdnManifest | null> {
  try {
    return await fetchCdnJson<CdnManifest>('meta/manifest.json');
  } catch {
    return null;
  }
}

/** Map app SportType / registry key → CDN teams file slug. */
export const CDN_TEAM_SPORTS = {
  nba: 'teams/nba.json',
  nfl: 'teams/nfl.json',
  epl: 'teams/epl.json',
  mlb: 'teams/mlb.json',
  nhl: 'teams/nhl.json',
} as const;

export type CdnTeamSport = keyof typeof CDN_TEAM_SPORTS;

export const APP_SPORT_TO_CDN: Record<string, CdnTeamSport | undefined> = {
  BASKETBALL: 'nba',
  FOOTBALL: 'nfl',
  SOCCER: 'epl',
  BASEBALL: 'mlb',
  HOCKEY: 'nhl',
};

export const ENGINE_SPORT_TO_CDN: Record<string, CdnTeamSport> = {
  BASKETBALL: 'nba',
  FOOTBALL: 'nfl',
  SOCCER: 'epl',
  BASEBALL: 'mlb',
  HOCKEY: 'nhl',
};
