import { externalFetchUrl } from '../../config/siyfApi';
import { fetchCdnJson } from '../../config/siyfCdn';
import type { PlayerSeasonRow } from '../../types';
import type { Player } from '../core/types';
import { cacheGet, cacheKey, cacheSetWithProfile } from '../core/cache';
import { CACHE_PROFILES } from '../core/cacheTiers';
import {
  createEngineLog,
  createParseSeasonHistory,
  FIGHTS_LABEL_INDEX,
  GOLF_LABEL_INDEX,
  safeTryAsync,
  TENNIS_LABEL_INDEX,
} from '../core/engineUtils';
import { mergeSeasonHistory } from '../core/mergePayload';
import type { EngineSport, SportEngineConfig } from '../sportConfig';
import { espnGolfAthlete } from './espnGolfSource';
import { espnMmaAthlete } from './espnMmaSource';
import { espnTennisAthlete } from './espnTennisSource';

const log = createEngineLog('historical');

/** Brief negative cache when a player has no historical rows — avoids repeat scrapes. */
const NEGATIVE_HISTORICAL_PROFILE = {
  tier: 'static' as const,
  ttlMs: 300_000,
  staleMs: 300_000,
};

type CsvMapping = Partial<Record<keyof PlayerSeasonRow, number>>;

const parseEspnTennisHistory = createParseSeasonHistory(TENNIS_LABEL_INDEX, log);
const parseEspnGolfHistory = createParseSeasonHistory(GOLF_LABEL_INDEX, log);
const parseEspnFightsHistory = createParseSeasonHistory(FIGHTS_LABEL_INDEX, log);

export function sportsReferenceSlug(playerId: string, playerName: string, nfl = false): string | null {
  if (/^[a-z]{5}\d{2}[a-z]?$/i.test(playerId)) {
    return nfl
      ? playerId.charAt(0).toUpperCase() + playerId.slice(1)
      : playerId.toLowerCase();
  }
  const parts = playerName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const last5 = parts[parts.length - 1].slice(0, 5);
  const first2 = parts[0].slice(0, 2);
  if (nfl) {
    const lastPart = last5.charAt(0).toUpperCase() + last5.slice(1).toLowerCase();
    const firstPart = first2.charAt(0).toUpperCase() + first2.slice(1).toLowerCase();
    return `${lastPart}${firstPart}00`;
  }
  return `${last5.toLowerCase()}${first2.toLowerCase()}01`;
}

function pfrSlugCandidates(playerId: string, playerName: string): string[] {
  if (/^[A-Za-z]{5}\d{2}[a-z]?$/i.test(playerId)) return [playerId];
  const parts = playerName.trim().split(/\s+/);
  if (parts.length < 2) return [];
  const last5 = parts[parts.length - 1].slice(0, 5);
  const first2 = parts[0].slice(0, 2);
  const base = last5.charAt(0).toUpperCase() + last5.slice(1).toLowerCase()
    + first2.charAt(0).toUpperCase() + first2.slice(1).toLowerCase();
  return ['00', '01', '02', '03'].map((n) => `${base}${n}`);
}

export function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ',' && !quoted) {
      cols.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cols.push(current.trim());
  return cols;
}

function parseCsvRows(csv: string): string[][] {
  return csv
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('Season') && !line.startsWith('Rk'))
    .map(splitCsvLine);
}

function mapCsvRow(
  cols: string[],
  mapping: CsvMapping,
  seasonIdx = 0,
  teamIdx = 1,
): PlayerSeasonRow | null {
  const season = cols[seasonIdx]?.replace('*', '').trim();
  if (!season || season === 'Career' || !/^\d{4}/.test(season)) return null;
  const val = (idx?: number) =>
    idx !== undefined && idx >= 0 && cols[idx] !== undefined && cols[idx] !== ''
      ? cols[idx]
      : '-';
  return {
    season,
    team: teamIdx >= 0 ? cols[teamIdx]?.trim() : undefined,
    gp: val(mapping.gp),
    min: val(mapping.min),
    pts: val(mapping.pts),
    reb: val(mapping.reb),
    ast: val(mapping.ast),
    stl: val(mapping.stl),
    blk: val(mapping.blk),
    fgPct: val(mapping.fgPct),
    fg3Pct: val(mapping.fg3Pct),
    ftPct: val(mapping.ftPct),
    to: val(mapping.to),
  };
}

export function parseMappedCsv(
  csv: string,
  mapping: CsvMapping,
  seasonIdx = 0,
  teamIdx = 1,
): PlayerSeasonRow[] {
  const rows: PlayerSeasonRow[] = [];
  for (const cols of parseCsvRows(csv)) {
    if (cols.length < 8) continue;
    const row = mapCsvRow(cols, mapping, seasonIdx, teamIdx);
    if (row) rows.push(row);
  }
  return rows.slice(0, 15);
}

async function fetchRemoteText(
  url: string,
  accept = 'text/csv,text/plain,*/*',
  allowHtml = false,
): Promise<string | null> {
  return safeTryAsync(
    log,
    'fetchRemoteText',
    url,
    async () => {
      const res = await fetch(externalFetchUrl(url), { headers: { Accept: accept } });
      if (!res.ok) return null;
      const text = await res.text();
      if (!allowHtml && (text.includes('<!DOCTYPE') || text.includes('<html'))) return null;
      return text;
    },
    null,
  );
}

async function fetchHistoricalCdn(prefix: string, slug: string): Promise<PlayerSeasonRow[] | null> {
  return safeTryAsync(
    log,
    'fetchHistoricalCdn',
    `${prefix}/${slug}`,
    () => fetchCdnJson<PlayerSeasonRow[]>(`stats/${prefix}/${slug.toLowerCase()}.json`),
    null,
  );
}

function cacheHistoricalRows(
  key: string,
  rows: PlayerSeasonRow[],
  playerId: string,
  sourceTag: string,
): void {
  const profile = rows.length ? CACHE_PROFILES.static : NEGATIVE_HISTORICAL_PROFILE;
  cacheSetWithProfile(key, rows, profile, [`player:${playerId}`, sourceTag]);
}

async function loadHistoricalRows(
  cachePrefix: string,
  slug: string,
  cdnPrefix: string,
  fetchRemote: () => Promise<PlayerSeasonRow[]>,
  playerId: string,
  sourceTag: string,
): Promise<PlayerSeasonRow[]> {
  const key = cacheKey(cachePrefix, slug.toLowerCase());
  const cached = cacheGet<PlayerSeasonRow[]>(key);
  if (cached !== undefined) return cached;

  const fromCdn = await fetchHistoricalCdn(cdnPrefix, slug);
  if (fromCdn !== null) {
    cacheHistoricalRows(key, fromCdn, playerId, sourceTag);
    return fromCdn;
  }

  const rows = await fetchRemote();
  cacheHistoricalRows(key, rows, playerId, sourceTag);
  return rows;
}

async function loadEspnHistoricalRows(
  cachePrefix: string,
  sourceTag: string,
  player: Player,
  fetchRaw: () => Promise<{ stats?: unknown; overview?: { statistics?: unknown; stats?: unknown } } | null>,
  parseRows: (raw: NonNullable<Awaited<ReturnType<typeof fetchRaw>>>) => PlayerSeasonRow[],
): Promise<PlayerSeasonRow[]> {
  const key = cacheKey(cachePrefix, player.id);
  const cached = cacheGet<PlayerSeasonRow[]>(key);
  if (cached !== undefined) return cached;

  const raw = await safeTryAsync(log, 'espn-historical', sourceTag, fetchRaw, null);
  const rows = raw ? parseRows(raw) : [];
  cacheHistoricalRows(key, rows, player.id, sourceTag);
  return rows;
}

const BBREF_MAP: CsvMapping = {
  gp: 5, min: 7, pts: 26, reb: 20, ast: 21, stl: 22, blk: 23, fgPct: 9, fg3Pct: 12, ftPct: 15, to: 24,
};

const BREF_BATTING_MAP: CsvMapping = {
  gp: 4, min: 6, pts: 17, reb: 10, ast: 11, stl: 8, blk: 13, fgPct: 20, fg3Pct: 16, ftPct: 12, to: 14,
};

const BREF_PITCHING_MAP: CsvMapping = {
  gp: 8, min: 13, pts: 6, reb: 4, ast: 12, stl: 7, blk: 16, fgPct: 5, fg3Pct: 18, ftPct: 10, to: 17,
};

const PFR_PASSING_MAP: CsvMapping = {
  gp: 4, min: -1, pts: 9, reb: 10, ast: 11, stl: 6, blk: 7, fgPct: 8, fg3Pct: 12, ftPct: 5, to: 13,
};

const PFR_RUSHING_MAP: CsvMapping = {
  gp: 4, min: -1, pts: 6, reb: 9, stl: 5, blk: 7, ast: 10, fgPct: 8, fg3Pct: -1, ftPct: -1, to: 11,
};

const PFR_RECEIVING_MAP: CsvMapping = {
  gp: 4, min: -1, pts: 7, reb: 10, stl: 6, blk: 8, ast: 11, fgPct: 9, fg3Pct: -1, ftPct: -1, to: 12,
};

const PFR_DEFENSE_MAP: CsvMapping = {
  gp: 4, min: -1, pts: 8, reb: 9, ast: 7, stl: 6, blk: 10, fgPct: 11, fg3Pct: -1, ftPct: -1, to: 12,
};

const HREF_SKATER_MAP: CsvMapping = {
  gp: 5, min: 24, pts: 8, reb: -1, ast: 7, stl: -1, blk: 18, fgPct: -1, fg3Pct: -1, ftPct: -1, to: 9,
};

const HREF_GOALIE_MAP: CsvMapping = {
  gp: 4, min: 29, pts: 6, reb: 4, ast: 5, stl: 7, blk: 8, fgPct: 9, fg3Pct: 10, ftPct: 11, to: 12,
};

const FBREF_MAP: CsvMapping = {
  gp: 5, min: 8, pts: 11, reb: 12, ast: 13, stl: 14, blk: 15, fgPct: 16, fg3Pct: 17, ftPct: 18, to: 19,
};

export async function fetchBasketballReferenceSeasonHistory(
  player: Player,
): Promise<PlayerSeasonRow[]> {
  const slug = sportsReferenceSlug(player.id, player.name);
  if (!slug) return [];

  return loadHistoricalRows(
    'bbref',
    slug,
    'bbref',
    async () => {
      const letter = slug[0];
      const csv = await fetchRemoteText(
        `https://www.basketball-reference.com/players/${letter}/${slug}/per_game.csv`,
      );
      return csv ? parseMappedCsv(csv, BBREF_MAP) : [];
    },
    player.id,
    'bbref',
  );
}

function isPitcher(position: string): boolean {
  return /\b(P|SP|RP|CP|LHP|RHP)\b/i.test(position);
}

function isGoalie(position: string): boolean {
  return /\b(G|GK|Goalie|Goaltender)\b/i.test(position);
}

function footballStatTypes(position: string): string[] {
  const pos = position.toUpperCase();
  if (/QB/.test(pos)) return ['passing'];
  if (/RB|FB|HB/.test(pos)) return ['rushing', 'receiving'];
  if (/WR|TE/.test(pos)) return ['receiving', 'rushing'];
  if (/LB|DE|DT|CB|S|DB|OL|OT|OG|C|G|T/.test(pos)) return ['defense', 'receiving'];
  return ['passing', 'rushing', 'receiving'];
}

const PFR_MAPS: Record<string, CsvMapping> = {
  passing: PFR_PASSING_MAP,
  rushing: PFR_RUSHING_MAP,
  receiving: PFR_RECEIVING_MAP,
  defense: PFR_DEFENSE_MAP,
};

export async function fetchProFootballReferenceSeasonHistory(
  player: Player,
): Promise<PlayerSeasonRow[]> {
  const slugs = pfrSlugCandidates(player.id, player.name);
  if (!slugs.length) return [];

  for (const slug of slugs) {
    const rows = await loadHistoricalRows(
      'pfr',
      slug,
      'pfr',
      async () => {
        const letter = slug[0];
        const statTypes = footballStatTypes(player.position);
        for (const statType of statTypes) {
          const csv = await fetchRemoteText(
            `https://www.pro-football-reference.com/players/${letter}/${slug}/${statType}.csv`,
          );
          if (!csv) continue;
          const map = PFR_MAPS[statType];
          if (!map) continue;
          const parsed = parseMappedCsv(csv, map);
          if (parsed.length) return parsed;
        }
        return [];
      },
      player.id,
      'pfr',
    );
    if (rows.length) return rows;
  }
  return [];
}

export async function fetchBaseballReferenceSeasonHistory(
  player: Player,
): Promise<PlayerSeasonRow[]> {
  const slug = sportsReferenceSlug(player.id, player.name);
  if (!slug) return [];

  const statType = isPitcher(player.position) ? 'pitching' : 'batting';
  const mapping = statType === 'pitching' ? BREF_PITCHING_MAP : BREF_BATTING_MAP;

  return loadHistoricalRows(
    'bref',
    `${slug}-${statType}`,
    'bref',
    async () => {
      const letter = slug[0];
      const csv = await fetchRemoteText(
        `https://www.baseball-reference.com/players/${letter}/${slug}/${statType}.csv`,
      );
      return csv ? parseMappedCsv(csv, mapping) : [];
    },
    player.id,
    'bref',
  );
}

export async function fetchHockeyReferenceSeasonHistory(
  player: Player,
): Promise<PlayerSeasonRow[]> {
  const slug = sportsReferenceSlug(player.id, player.name);
  if (!slug) return [];

  const statType = isGoalie(player.position) ? 'goalie' : 'skaters';
  const mapping = statType === 'goalie' ? HREF_GOALIE_MAP : HREF_SKATER_MAP;

  return loadHistoricalRows(
    'href',
    `${slug}-${statType}`,
    'href',
    async () => {
      const letter = slug[0];
      const csv = await fetchRemoteText(
        `https://www.hockey-reference.com/players/${letter}/${slug}/${statType}.csv`,
      );
      return csv ? parseMappedCsv(csv, mapping) : [];
    },
    player.id,
    'href',
  );
}

async function resolveFbrefPlayerPath(playerName: string): Promise<string | null> {
  const cacheId = cacheKey('fbref-search', playerName.toLowerCase());
  const cached = cacheGet<string>(cacheId);
  if (cached) return cached;

  const html = await fetchRemoteText(
    `https://fbref.com/en/search/search.fcgi?search=${encodeURIComponent(playerName)}`,
    'text/html,*/*',
    true,
  );
  if (!html) return null;

  const match = html.match(/href="(\/en\/players\/[a-f0-9]{8}\/[^"]+)"/i);
  if (!match?.[1]) return null;

  cacheSetWithProfile(cacheId, match[1], CACHE_PROFILES.static, ['fbref-search']);
  return match[1];
}

export async function fetchFbrefSeasonHistory(player: Player): Promise<PlayerSeasonRow[]> {
  const path = await resolveFbrefPlayerPath(player.name);
  if (!path) return [];

  const slug = path.split('/').pop() ?? player.name;

  return loadHistoricalRows(
    'fbref',
    slug,
    'fbref',
    async () => {
      const csvCandidates = [
        `https://fbref.com${path}/summary.csv`,
        `https://fbref.com${path}/all_comps.csv`,
        `https://fbref.com${path}/summary/summary.csv`,
      ];
      for (const url of csvCandidates) {
        const csv = await fetchRemoteText(url);
        if (!csv) continue;
        const parsed = parseMappedCsv(csv, FBREF_MAP, 0, 2);
        if (parsed.length) return parsed;
      }
      return [];
    },
    player.id,
    'fbref',
  );
}

export async function fetchEspnTennisSeasonHistory(player: Player): Promise<PlayerSeasonRow[]> {
  return loadEspnHistoricalRows(
    'historical-espn-tennis',
    'espn-tennis-historical',
    player,
    () => espnTennisAthlete(player.id),
    (raw) => (raw.stats ? parseEspnTennisHistory(raw.stats, (raw.stats as { teams?: unknown }).teams ?? {}) : []),
  );
}

export async function fetchEspnGolfSeasonHistory(player: Player): Promise<PlayerSeasonRow[]> {
  return loadEspnHistoricalRows(
    'historical-espn-golf',
    'espn-golf-historical',
    player,
    () => espnGolfAthlete(player.id),
    (raw) => (raw.stats ? parseEspnGolfHistory(raw.stats, (raw.stats as { teams?: unknown }).teams ?? {}) : []),
  );
}

export function aggregateSherdogFights(html: string): PlayerSeasonRow[] {
  const byYear = new Map<string, { gp: number; wins: number; losses: number; draws: number }>();
  const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowPattern) ?? [];

  for (const row of rows) {
    const dateMatch = row.match(/(\w{3}\s+\d{1,2},\s+(\d{4}))/);
    if (!dateMatch) continue;
    const year = dateMatch[2];
    const resultMatch = row.match(/>\s*(win|loss|draw|nc)\s*</i);
    if (!resultMatch) continue;

    const bucket = byYear.get(year) ?? { gp: 0, wins: 0, losses: 0, draws: 0 };
    bucket.gp += 1;
    const result = resultMatch[1].toLowerCase();
    if (result === 'win') bucket.wins += 1;
    else if (result === 'loss') bucket.losses += 1;
    else bucket.draws += 1;
    byYear.set(year, bucket);
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12)
    .map(([season, stats]) => ({
      season,
      gp: String(stats.gp),
      min: '-',
      pts: String(stats.wins),
      reb: String(stats.losses),
      ast: String(stats.draws),
      stl: '-',
      blk: '-',
      fgPct: '-',
      fg3Pct: '-',
      ftPct: '-',
      to: '-',
    }));
}

async function fetchSherdogSeasonHistory(player: Player): Promise<PlayerSeasonRow[]> {
  const key = cacheKey('sherdog', player.id, player.name.toLowerCase());
  const cached = cacheGet<PlayerSeasonRow[]>(key);
  if (cached !== undefined) return cached;

  const searchHtml = await fetchRemoteText(
    `https://www.sherdog.com/stats/fightfinder?SearchText=${encodeURIComponent(player.name)}`,
    'text/html,*/*',
    true,
  );
  if (!searchHtml) {
    cacheHistoricalRows(key, [], player.id, 'sherdog');
    return [];
  }

  const fighterMatch = searchHtml.match(/href="(\/fighter\/[^"]+)"/i);
  if (!fighterMatch?.[1]) {
    cacheHistoricalRows(key, [], player.id, 'sherdog');
    return [];
  }

  const fighterHtml = await fetchRemoteText(
    `https://www.sherdog.com${fighterMatch[1]}`,
    'text/html,*/*',
    true,
  );
  const rows = fighterHtml ? aggregateSherdogFights(fighterHtml) : [];
  cacheHistoricalRows(key, rows, player.id, 'sherdog');
  return rows;
}

export async function fetchEspnMmaSeasonHistory(
  player: Player,
): Promise<{ rows: PlayerSeasonRow[]; source: string }> {
  const key = cacheKey('historical-espn-mma', player.id);
  const cached = cacheGet<{ rows: PlayerSeasonRow[]; source: string }>(key);
  if (cached !== undefined) return cached;

  const raw = await safeTryAsync(log, 'espn-mma-historical', player.id, () => espnMmaAthlete(player.id), null);
  const overviewStats = raw?.overview?.statistics ?? raw?.overview?.stats;
  let rows = overviewStats
    ? parseEspnFightsHistory(overviewStats, (overviewStats as { teams?: unknown }).teams ?? {})
    : [];
  let source = 'espn_mma_historical';

  if (!rows.length) {
    rows = await fetchSherdogSeasonHistory(player);
    source = 'sherdog';
  }

  const result = { rows, source };
  cacheSetWithProfile(
    key,
    result,
    rows.length ? CACHE_PROFILES.static : NEGATIVE_HISTORICAL_PROFILE,
    [`player:${player.id}`, source],
  );
  return result;
}

const HISTORICAL_FETCHERS: Record<
  EngineSport,
  (player: Player) => Promise<{ rows: PlayerSeasonRow[]; source: string } | null>
> = {
  BASKETBALL: async (player) => {
    const rows = await fetchBasketballReferenceSeasonHistory(player);
    return rows.length ? { rows, source: 'basketball_reference' } : null;
  },
  FOOTBALL: async (player) => {
    const rows = await fetchProFootballReferenceSeasonHistory(player);
    return rows.length ? { rows, source: 'pro_football_reference' } : null;
  },
  BASEBALL: async (player) => {
    const rows = await fetchBaseballReferenceSeasonHistory(player);
    return rows.length ? { rows, source: 'baseball_reference' } : null;
  },
  HOCKEY: async (player) => {
    const rows = await fetchHockeyReferenceSeasonHistory(player);
    return rows.length ? { rows, source: 'hockey_reference' } : null;
  },
  SOCCER: async (player) => {
    const rows = await fetchFbrefSeasonHistory(player);
    return rows.length ? { rows, source: 'fbref' } : null;
  },
  TENNIS: async (player) => {
    const rows = await fetchEspnTennisSeasonHistory(player);
    return rows.length ? { rows, source: 'espn_tennis_historical' } : null;
  },
  GOLF: async (player) => {
    const rows = await fetchEspnGolfSeasonHistory(player);
    return rows.length ? { rows, source: 'espn_golf_historical' } : null;
  },
  FIGHTS: async (player) => {
    const result = await fetchEspnMmaSeasonHistory(player);
    return result.rows.length ? result : null;
  },
};

export async function fetchHistoricalSeasonHistory(
  sport: EngineSport,
  player: Player,
): Promise<{ rows: PlayerSeasonRow[]; source: string } | null> {
  return safeTryAsync(
    log,
    'fetchHistoricalSeasonHistory',
    `${sport}:${player.id}`,
    () => HISTORICAL_FETCHERS[sport](player),
    null,
  );
}

export function createHistoricalAfterPlayerDetails(
  sport: EngineSport,
): NonNullable<SportEngineConfig['afterPlayerDetails']> {
  return async (player, detail, sources) => {
    if (detail.seasonHistory.length) return { detail, sources };
    const result = await fetchHistoricalSeasonHistory(sport, player);
    if (!result?.rows.length) return { detail, sources };
    return {
      detail: {
        ...detail,
        seasonHistory: mergeSeasonHistory(detail.seasonHistory, result.rows),
      },
      sources: [...sources, result.source],
    };
  };
}
