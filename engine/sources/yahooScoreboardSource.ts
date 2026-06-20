import { cacheKey, cachedFetch } from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import { mergeScoreboardGames } from '../core/mergeGames';
import { fetchYahooScoreboardSelfPatch } from '../core/scoreboardSelfPatch';
import { extractYahooScoreboardRoot } from '../adjuster/sourcePatch/schemaPaths';
import type { Game, GameContext } from '../../types';
import type { EngineSport } from '../sportConfig';

import { enrichGameContext } from '../core/mergePayload';
import { enrichTeamForSport, resolveTeamLogoForSport } from './teamRegistry';
import { enrichGameWithTiming } from '../../utils/gameTime';
import { parseDisplayScore } from '../../utils/coerce';
const YAHOO_PREFIX_TO_SPORT: Record<string, EngineSport> = {
  nba: 'BASKETBALL',
  wnba: 'BASKETBALL',
  nfl: 'FOOTBALL',
  mlb: 'BASEBALL',
  nhl: 'HOCKEY',
  soccer: 'SOCCER',
};

const ENGINE_SPORT_TO_YAHOO_PREFIX: Partial<Record<EngineSport, string[]>> = {
  BASKETBALL: ['nba', 'wnba'],
  FOOTBALL: ['nfl'],
  BASEBALL: ['mlb'],
  HOCKEY: ['nhl'],
  SOCCER: ['soccer'],
};

export interface YahooGameRow {
  gameid?: string;
  global_gameid?: string;
  start_time?: string;
  home_team_id?: string;
  away_team_id?: string;
  status_display_name?: string;
  status_description?: string;
  status_type?: string;
  total_away_points?: string | number | null;
  total_home_points?: string | number | null;
  game_time_elapsed_display?: string | null;
  tv_coverage?: string;
  subleague?: string | null;
  subleague_display_name?: string | null;
  game_type?: string | null;
  game_periods?: Array<{
    away_points?: string | number | boolean | null;
    home_points?: string | number | boolean | null;
  }>;
}

export interface YahooTeamRow {
  team_id?: string;
  display_name?: string;
  full_name?: string;
  abbr?: string;
  logo?: unknown;
  colorPrimary?: unknown;
  colorSecondary?: unknown;
  record?: unknown;
}

type YahooBoard = Record<string, unknown>;

function yahooSportLabel(prefix: string): string {
  switch (prefix) {
    case 'mlb': return 'MLB';
    case 'nba': return 'NBA';
    case 'wnba': return 'WNBA';
    case 'nfl': return 'NFL';
    case 'nhl': return 'NHL';
    case 'soccer': return 'SOCCER';
    default: return prefix.toUpperCase();
  }
}

function parseYahooPrefix(gameId: string): string | null {
  const match = /^([a-z]+)\./i.exec(gameId);
  return match?.[1]?.toLowerCase() ?? null;
}

export function supportsYahooScoreFallback(sport: EngineSport): boolean {
  return Boolean(ENGINE_SPORT_TO_YAHOO_PREFIX[sport]?.length);
}

/** Resolve Yahoo data-island refs like `["teamLogo", "mlb.t.19"]`. */
export function resolveYahooRef(board: YahooBoard, ref: unknown): unknown {
  if (ref == null) return null;
  if (typeof ref !== 'object' || !Array.isArray(ref)) return ref;
  const parts = ref as string[];
  if (!parts.length || parts[0] === 'dataIslandPaths') return null;

  const [table, ...keys] = parts;
  let cur: unknown = board[table];
  for (const key of keys) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function parseYahooStatus(
  statusType: string | undefined,
  statusDisplay: string | undefined,
  elapsedDisplay: string | null | undefined,
): { status: string; statusState: 'pre' | 'in' | 'post'; clock: string } {
  const type = (statusType ?? '').toLowerCase();
  const display = statusDisplay?.trim();

  if (type.includes('final') || type.includes('complete')) {
    return { status: display || 'Final', statusState: 'post', clock: display || 'Final' };
  }
  if (type.includes('in_progress') || type.includes('in progress') || type.includes('live')) {
    const clock = elapsedDisplay?.trim() || display || 'Live';
    return { status: display || 'Live', statusState: 'in', clock };
  }
  if (type.includes('pregame') || type.includes('pre_game') || type.includes('scheduled')) {
    return { status: display || 'Scheduled', statusState: 'pre', clock: '—' };
  }

  const desc = display?.toLowerCase() ?? '';
  if (/final|ft\b|ended/.test(desc)) {
    return { status: display || 'Final', statusState: 'post', clock: display || 'Final' };
  }
  if (/live|in progress|bot|top|q\d|p\d|\d+'/i.test(display ?? '')) {
    return { status: display || 'Live', statusState: 'in', clock: display || 'Live' };
  }

  return { status: display || 'Scheduled', statusState: 'pre', clock: '—' };
}

function parseScore(value: unknown): number | string | null {
  return parseDisplayScore(value);
}

function formatColor(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const hex = value.trim().replace(/^#/, '');
  return hex ? `#${hex}` : undefined;
}

function parseLinescores(
  periods: YahooGameRow['game_periods'],
): { away: (number | string)[]; home: (number | string)[] } | undefined {
  if (!periods?.length) return undefined;
  const away: (number | string)[] = [];
  const home: (number | string)[] = [];

  for (const period of periods) {
    const a = parseScore(period.away_points);
    const h = parseScore(period.home_points);
    if (a != null && a !== '') away.push(a);
    if (h != null && h !== '') home.push(h);
  }

  return away.length || home.length ? { away, home } : undefined;
}

function resolveTeamSide(
  board: YahooBoard,
  teams: Record<string, YahooTeamRow>,
  teamId: string | undefined,
  score: unknown,
  engineSport: EngineSport,
  lines?: (number | string)[],
): Game['away'] | null {
  if (!teamId) return null;
  const row = teams[teamId];
  if (!row?.abbr) return null;

  const name = row.full_name || row.display_name || row.abbr;
  const logo = resolveYahooRef(board, row.logo);
  const color = formatColor(resolveYahooRef(board, row.colorPrimary));
  const alternateColor = formatColor(resolveYahooRef(board, row.colorSecondary));
  const record = resolveYahooRef(board, row.record);
  const reg = enrichTeamForSport(engineSport, row.abbr, { name, logo: typeof logo === 'string' ? logo : undefined });

  return {
    id: teamId,
    name: reg.name || name,
    abbr: reg.abbr,
    score: parseScore(score),
    logo: resolveTeamLogoForSport(engineSport, reg.abbr, typeof logo === 'string' ? logo : reg.logo),
    color: color ?? reg.color,
    alternateColor: alternateColor ?? reg.alternateColor,
    linescores: lines,
    record: typeof record === 'string' ? record : undefined,
  };
}

function extractYahooBroadcast(board: YahooBoard, gameId: string, tvCoverage?: string): string | undefined {
  const trimmed = tvCoverage?.trim();
  if (trimmed) return trimmed;

  const tvDetails = board.gametv_details as Record<string, { tv_details?: Array<{ abbr?: string; name?: string }> }> | undefined;
  const details = tvDetails?.[gameId]?.tv_details;
  const first = details?.[0];
  return first?.name || first?.abbr || undefined;
}

function extractYahooOddsContext(board: YahooBoard, gameId: string): Partial<GameContext> | null {
  const oddsTable = board.gameodds as Record<string, Record<string, {
    book_name?: string | null;
    away_spread?: string;
    home_spread?: string;
    total?: string;
  }>> | undefined;
  const books = oddsTable?.[gameId];
  if (!books) return null;

  for (const book of Object.values(books)) {
    const spread = book.away_spread ?? book.home_spread;
    const total = book.total;
    if (!spread && !total) continue;
    return {
      oddsSpread: spread ? `${spread}` : undefined,
      oddsTotal: total ? `O/U ${total}` : undefined,
      oddsBook: book.book_name ?? 'Yahoo',
      priority: 200,
    };
  }
  return null;
}

export function getYahooScoreboardRoot(raw: unknown): YahooBoard | null {
  return extractYahooScoreboardRoot(raw);
}

export function mapYahooScoreboardGames(raw: unknown, sport: EngineSport): Game[] {
  const board = getYahooScoreboardRoot(raw);
  if (!board) return [];

  const allowedPrefixes = new Set(ENGINE_SPORT_TO_YAHOO_PREFIX[sport] ?? []);
  if (!allowedPrefixes.size) return [];

  const gamesMap = board.games as Record<string, YahooGameRow> | undefined;
  const teamsMap = board.teams as Record<string, YahooTeamRow> | undefined;
  if (!gamesMap || !teamsMap) return [];

  const games: Game[] = [];

  for (const [gameKey, row] of Object.entries(gamesMap)) {
    const prefix = parseYahooPrefix(row.gameid ?? gameKey);
    if (!prefix || !allowedPrefixes.has(prefix)) continue;

    const engineSport = YAHOO_PREFIX_TO_SPORT[prefix] ?? sport;
    const sportLabel = yahooSportLabel(prefix);
    const parsed = parseYahooStatus(
      row.status_type,
      row.status_display_name ?? row.status_description,
      row.game_time_elapsed_display,
    );
    const lines = parseLinescores(row.game_periods);
    const away = resolveTeamSide(
      board,
      teamsMap,
      row.away_team_id,
      row.total_away_points,
      engineSport,
      lines?.away,
    );
    const home = resolveTeamSide(
      board,
      teamsMap,
      row.home_team_id,
      row.total_home_points,
      engineSport,
      lines?.home,
    );
    if (!away || !home) continue;

    const gameId = row.global_gameid ?? row.gameid ?? gameKey;
    const broadcast = extractYahooBroadcast(board, gameKey, row.tv_coverage);

    let game: Game = {
      id: `yahoo-${gameId}`,
      sport: prefix === 'wnba' ? 'WNBA' : sportLabel,
      status: parsed.status,
      statusState: parsed.statusState,
      clock: parsed.statusState === 'in' ? parsed.clock : parsed.clock,
      away,
      home,
      broadcast,
      subtitle: row.subleague_display_name ?? row.game_type ?? undefined,
    };

    const oddsCtx = extractYahooOddsContext(board, gameKey);
    if (oddsCtx) {
      game = { ...game, context: enrichGameContext(game, oddsCtx).context };
    }

    if (row.start_time) {
      const iso = new Date(row.start_time).toISOString();
      if (!Number.isNaN(Date.parse(iso))) {
        const { timing, clock } = enrichGameWithTiming(game, [{ iso, source: 'inferred', weight: 75 }]);
        game = {
          ...game,
          timing,
          clock: parsed.statusState === 'in' ? game.clock : clock,
        };
      }
    }

    games.push(game);
  }

  return games;
}

export async function fetchYahooScoreboard(): Promise<unknown | null> {
  const key = cacheKey('yahoo', 'scoreboard', 'trending');
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    () => fetchYahooScoreboardSelfPatch(),
    ['scoreboard', 'yahoo'],
  );
}

export async function fetchYahooGamesForSport(sport: EngineSport): Promise<Game[]> {
  const raw = await fetchYahooScoreboard();
  if (!raw) return [];
  return mapYahooScoreboardGames(raw, sport);
}

export async function mergeYahooScoreboard(sport: EngineSport, games: Game[]): Promise<Game[]> {
  const raw = await fetchYahooScoreboard();
  if (!raw) return games;
  const yahooGames = mapYahooScoreboardGames(raw, sport);
  if (!yahooGames.length) return games;
  return mergeScoreboardGames(games, yahooGames, sport);
}
