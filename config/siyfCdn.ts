/** Sports-in-your-face/siyf-cdn via jsDelivr — logos, teams, stats, favicons. */
function readCdnBase(): string {
  const fromProcess = typeof process !== 'undefined' ? process.env.SIYF_CDN_URL : undefined;
  const fromVite = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SIYF_CDN_URL : undefined;
  return fromProcess ?? fromVite ?? 'https://cdn.jsdelivr.net/gh/Sports-in-your-face/siyf-web-cdn@main';
}

export const SIYF_CDN_BASE = readCdnBase();

export const META_JSON_TTL_MS = 30_000;

export function cdnUrl(path: string, version?: number): string {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  const base = `${SIYF_CDN_BASE}/${normalized}`;
  return version != null && version > 0 ? `${base}?v=${version}` : base;
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

interface JsonCacheEntry {
  data: unknown;
  fetchedAt: number;
  etag?: string;
}

const jsonCache = new Map<string, JsonCacheEntry>();
let manifestVersions: {
  fieldAliasesVersion?: number;
  pauseKeywordsVersion?: number;
  adjusterSchemaVersion?: number;
} = {};

function isMetaPath(path: string): boolean {
  return path.startsWith('meta/');
}

function cacheTtlFor(path: string): number {
  return isMetaPath(path) ? META_JSON_TTL_MS : Number.POSITIVE_INFINITY;
}

export async function fetchCdnJson<T>(path: string, version?: number): Promise<T | null> {
  const url = cdnUrl(path, version);
  const ttl = cacheTtlFor(path);
  const cached = jsonCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < ttl) {
    return cached.data as T;
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  const res = await fetch(url, { headers });
  if (res.status === 304 && cached) return cached.data as T;
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`CDN fetch failed (${res.status}): ${url}`);

  const data = (await res.json()) as T;
  jsonCache.set(url, {
    data,
    fetchedAt: Date.now(),
    etag: res.headers.get('ETag') ?? undefined,
  });
  return data;
}

export function clearCdnCache(paths?: string[]): void {
  if (!paths?.length) {
    jsonCache.clear();
    return;
  }
  for (const key of [...jsonCache.keys()]) {
    if (paths.some((p) => key.includes(p))) jsonCache.delete(key);
  }
}

export interface CdnManifest {
  version: number;
  syncedAt: string;
  fieldAliasesVersion?: number;
  pauseKeywordsVersion?: number;
  adjusterSchemaVersion?: number;
  sports?: { sport: string; teams: number }[];
}

export interface CdnAdjusterSchemaFile {
  version: number;
  registryVersion?: number;
  governor?: { hourBudget: number; ageOutMs: number };
  providers?: string[];
  dlq?: { maxEntries: number; alertThrottleMs: number };
  chrono?: {
    pauseEnterPayloads?: number;
    pollIntervals?: Record<string, number>;
  };
}

export interface CdnFieldAliasEntry {
  paths: string[][];
}

export interface CdnFieldAliasesFile {
  version: number;
  fields: Record<string, CdnFieldAliasEntry>;
}

export interface CdnPauseKeywordsFile {
  version: number;
  global: string[];
  sports?: Record<string, string[]>;
}

export async function fetchCdnManifest(force = false): Promise<CdnManifest | null> {
  try {
    if (!force) {
      const cached = jsonCache.get(cdnUrl('meta/manifest.json'));
      if (cached && Date.now() - cached.fetchedAt < META_JSON_TTL_MS) {
        return cached.data as CdnManifest;
      }
    }
    const manifest = await fetchCdnJson<CdnManifest>('meta/manifest.json');
    if (manifest) {
      const prevField = manifestVersions.fieldAliasesVersion;
      const prevPause = manifestVersions.pauseKeywordsVersion;
      const prevSchema = manifestVersions.adjusterSchemaVersion;
      manifestVersions = {
        fieldAliasesVersion: manifest.fieldAliasesVersion,
        pauseKeywordsVersion: manifest.pauseKeywordsVersion,
        adjusterSchemaVersion: manifest.adjusterSchemaVersion,
      };
      if (manifest.fieldAliasesVersion !== prevField) {
        clearCdnCache(['field-aliases.json']);
      }
      if (manifest.pauseKeywordsVersion !== prevPause) {
        clearCdnCache(['pause-keywords.json']);
      }
      if (manifest.adjusterSchemaVersion !== prevSchema) {
        clearCdnCache(['adjuster-schema.json']);
      }
    }
    return manifest;
  } catch {
    return null;
  }
}

export async function fetchCdnFieldAliases(): Promise<CdnFieldAliasesFile | null> {
  await fetchCdnManifest();
  const version = manifestVersions.fieldAliasesVersion;
  return fetchCdnJson<CdnFieldAliasesFile>('meta/field-aliases.json', version);
}

export async function fetchCdnPauseKeywords(): Promise<CdnPauseKeywordsFile | null> {
  await fetchCdnManifest();
  const version = manifestVersions.pauseKeywordsVersion;
  return fetchCdnJson<CdnPauseKeywordsFile>('meta/pause-keywords.json', version);
}

export async function fetchCdnAdjusterSchema(): Promise<CdnAdjusterSchemaFile | null> {
  await fetchCdnManifest();
  const version = manifestVersions.adjusterSchemaVersion;
  return fetchCdnJson<CdnAdjusterSchemaFile>('meta/adjuster-schema.json', version);
}

/** Map app SportType / registry key → CDN teams file slug. */
export const CDN_TEAM_SPORTS = {
  nba: 'teams/nba.json',
  wnba: 'teams/wnba.json',
  nfl: 'teams/nfl.json',
  epl: 'teams/epl.json',
  mls: 'teams/mls.json',
  mlb: 'teams/mlb.json',
  nhl: 'teams/nhl.json',
} as const;

export const BASKETBALL_LEAGUE_TO_CDN: Partial<Record<string, CdnTeamSport>> = {
  WNBA: 'wnba',
};

export type CdnTeamSport = keyof typeof CDN_TEAM_SPORTS;

export const APP_SPORT_TO_CDN: Record<string, CdnTeamSport | undefined> = {
  BASKETBALL: 'nba',
  FOOTBALL: 'nfl',
  SOCCER: 'mls',
  BASEBALL: 'mlb',
  HOCKEY: 'nhl',
};

export const ENGINE_SPORT_TO_CDN: Record<string, CdnTeamSport> = {
  BASKETBALL: 'nba',
  FOOTBALL: 'nfl',
  SOCCER: 'mls',
  BASEBALL: 'mlb',
  HOCKEY: 'nhl',
};

export function soccerCdnTeamKey(): CdnTeamSport {
  const league = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SIYF_SOCCER_LEAGUE : undefined;
  return league === 'usa.1' ? 'mls' : 'epl';
}
