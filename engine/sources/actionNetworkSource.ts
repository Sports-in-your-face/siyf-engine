import { cacheKey, cachedFetch } from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import { fetchJsonResilient } from '../core/resilientFetch';
import { filterGamesNeedingOdds, gameHasOddsContext } from '../core/paidApiPolicy';
import type { Game, GameContext } from '../../types';
import { enrichTeamForSport, resolveTeamLogoForSport } from './teamRegistry';
import { enrichGameWithTiming } from '../../utils/gameTime';
import { siyfApiUrl } from '../../config/siyfApi';
import { gameMatchKey, inferEngineSportFromGame, mergeScoreboardGames } from '../core/mergeGames';
import { enrichGameContext } from '../core/mergePayload';
import type { EngineSport } from '../sportConfig';

const PROXY_BASE = siyfApiUrl('/api/action-network');

/** Action Network sportsbook IDs — real books only (no consensus aggregates). */
const PREFERRED_BOOK_ORDER = [68, 69, 75, 71] as const;

const SPORT_TO_AN_LEAGUE: Partial<Record<EngineSport, string>> = {
  BASKETBALL: 'nba',
  FOOTBALL: 'nfl',
  BASEBALL: 'mlb',
  HOCKEY: 'nhl',
};

const AN_LEAGUE_TO_ENGINE_SPORT: Record<string, EngineSport> = {
  nba: 'BASKETBALL',
  nfl: 'FOOTBALL',
  mlb: 'BASEBALL',
  nhl: 'HOCKEY',
};

export interface AnTeam {
  id: number;
  full_name: string;
  abbr: string;
  logo?: string;
  primary_color?: string;
  secondary_color?: string;
}

interface AnOddsLine {
  type: string;
  book_id: number;
  spread_away?: number | null;
  spread_home?: number | null;
  total?: number | null;
}

export interface AnGame {
  id: number;
  status: string;
  real_status?: string;
  status_display?: string | null;
  start_time?: string;
  away_team_id: number;
  home_team_id: number;
  teams: AnTeam[];
  odds?: AnOddsLine[];
  broadcast?: { network?: string; network_short?: string };
  boxscore?: {
    total_away_points?: number;
    total_home_points?: number;
    period?: number;
    clock?: string;
    line_score?: { away?: (number | null)[]; home?: (number | null)[] };
  };
  away_score?: number | null;
  home_score?: number | null;
}

export interface AnScoreboardResponse {
  games?: AnGame[];
}

export function getActionNetworkLeague(sport: EngineSport): string | null {
  return SPORT_TO_AN_LEAGUE[sport] ?? null;
}

export function supportsActionNetwork(sport: EngineSport): boolean {
  return Boolean(getActionNetworkLeague(sport));
}

function isRelevantGame(game: Game, sport: EngineSport): boolean {
  const s = game.sport;
  switch (sport) {
    case 'BASKETBALL':
      if (!s) return true;
      if (s === 'WNBA' || s === 'NCAA') return false;
      return s === 'NBA' || s === 'BASKETBALL';
    case 'FOOTBALL':
      return !s || s === 'FOOTBALL' || s === 'NFL';
    case 'BASEBALL':
      return !s || s === 'BASEBALL' || s === 'MLB';
    case 'HOCKEY':
      return !s || s === 'HOCKEY' || s === 'NHL';
    default:
      return false;
  }
}

function parseAnStatus(status: string, display?: string | null): {
  status: string;
  statusState: 'pre' | 'in' | 'post';
  clock: string;
} {
  const s = (status ?? '').toLowerCase();
  const d = display?.trim();

  if (/final|complete|closed|postponed.*final/.test(s)) {
    return { status: d || 'Final', statusState: 'post', clock: 'Final' };
  }
  if (/inprogress|in_progress|live|halftime|half|overtime|ot\b|q\d|period|inning|top|bot|middle/.test(s)) {
    return { status: d || status, statusState: 'in', clock: d || status };
  }
  return { status: d || 'Scheduled', statusState: 'pre', clock: '—' };
}

function teamById(teams: AnTeam[], id: number): AnTeam | undefined {
  return teams.find((t) => t.id === id);
}

function formatAnClock(league: string, period?: number, clock?: string): string | undefined {
  if (!period && !clock) return undefined;
  if (period && clock) {
    if (league === 'nhl') return `P${period} ${clock}`;
    if (league === 'mlb') return `${clock}`;
    return `Q${period} ${clock}`;
  }
  return clock;
}

function resolveScores(g: AnGame, league: string): {
  awayScore: number | null;
  homeScore: number | null;
  awayLines?: (number | string)[];
  homeLines?: (number | string)[];
  clock?: string;
} {
  const box = g.boxscore;
  let awayScore = g.away_score ?? box?.total_away_points ?? null;
  let homeScore = g.home_score ?? box?.total_home_points ?? null;

  const awayLines = box?.line_score?.away?.filter((v) => v != null) as number[] | undefined;
  const homeLines = box?.line_score?.home?.filter((v) => v != null) as number[] | undefined;

  if (awayScore == null && awayLines?.length) {
    awayScore = awayLines.reduce((a, b) => a + b, 0);
  }
  if (homeScore == null && homeLines?.length) {
    homeScore = homeLines.reduce((a, b) => a + b, 0);
  }

  return {
    awayScore: awayScore ?? null,
    homeScore: homeScore ?? null,
    awayLines,
    homeLines,
    clock: formatAnClock(league, box?.period, box?.clock),
  };
}

export function mapActionNetworkGames(raw: AnScoreboardResponse, league: string): Game[] {
  const engineSport = AN_LEAGUE_TO_ENGINE_SPORT[league] ?? 'BASKETBALL';
  const games = raw?.games ?? [];

  return games.map((g) => {
    const awayRaw = teamById(g.teams, g.away_team_id);
    const homeRaw = teamById(g.teams, g.home_team_id);
    if (!awayRaw || !homeRaw) return null;

    const parsed = parseAnStatus(g.real_status ?? g.status, g.status_display);
    const scores = resolveScores(g, league);
    const awayReg = enrichTeamForSport(engineSport, awayRaw.abbr, { name: awayRaw.full_name });
    const homeReg = enrichTeamForSport(engineSport, homeRaw.abbr, { name: homeRaw.full_name });

    const base: Game = {
      id: `an-${g.id}`,
      sport: engineSport,
      status: parsed.status,
      statusState: parsed.statusState,
      clock: scores.clock && parsed.statusState === 'in' ? scores.clock : parsed.clock,
      away: {
        name: awayReg.name || awayRaw.full_name,
        abbr: awayReg.abbr,
        score: scores.awayScore,
        logo: resolveTeamLogoForSport(engineSport, awayReg.abbr, awayRaw.logo ?? awayReg.logo),
        color: awayRaw.primary_color ?? awayReg.color,
        alternateColor: awayRaw.secondary_color ?? awayReg.alternateColor,
        linescores: scores.awayLines,
      },
      home: {
        name: homeReg.name || homeRaw.full_name,
        abbr: homeReg.abbr,
        score: scores.homeScore,
        logo: resolveTeamLogoForSport(engineSport, homeReg.abbr, homeRaw.logo ?? homeReg.logo),
        color: homeRaw.primary_color ?? homeReg.color,
        alternateColor: homeRaw.secondary_color ?? homeReg.alternateColor,
        linescores: scores.homeLines,
      },
      broadcast: g.broadcast?.network ?? g.broadcast?.network_short,
    };

    const oddsCtx = extractActionNetworkOddsContext(g);
    if (oddsCtx) {
      base.context = enrichGameContext(base, oddsCtx).context;
    }

    if (g.start_time) {
      const { timing, clock } = enrichGameWithTiming(base, [{ iso: g.start_time, source: 'inferred', weight: 80 }]);
      return { ...base, timing, clock: parsed.statusState === 'in' ? base.clock : clock };
    }

    return base;
  }).filter((g): g is Game => g != null);
}

export async function fetchActionNetworkScoreboard(league: string): Promise<AnScoreboardResponse | null> {
  const key = cacheKey('action-network', 'scoreboard', league);
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    ({ bypassCache }) =>
      fetchJsonResilient<AnScoreboardResponse>(
        `${PROXY_BASE}/scoreboard/${league}`,
        undefined,
        { label: `an-scoreboard-${league}`, retries: 1, timeout: 8_000, bypassCache },
      ),
    ['scoreboard', 'action-network', league],
  );
}

export async function fetchActionNetworkGames(sport: EngineSport): Promise<AnGame[]> {
  const league = getActionNetworkLeague(sport);
  if (!league) return [];
  const raw = await fetchActionNetworkScoreboard(league);
  return raw?.games ?? [];
}

export function matchActionNetworkGame(anGames: AnGame[], game: Game): AnGame | undefined {
  const sport = inferEngineSportFromGame(game) ?? 'BASKETBALL';
  const key = gameMatchKey(game.away.abbr, game.home.abbr, sport);
  return anGames.find((g) => {
    const away = teamById(g.teams, g.away_team_id);
    const home = teamById(g.teams, g.home_team_id);
    if (!away || !home) return false;
    return gameMatchKey(away.abbr, home.abbr, sport) === key;
  });
}

const BOOK_LABELS: Record<number, string> = {
  69: 'FANDUEL',
  68: 'DRAFTKINGS',
  75: 'BETMGM',
  71: 'CAESARS',
};

function pickPreferredBookLine(gameLines: AnOddsLine[]): AnOddsLine | undefined {
  for (const bookId of PREFERRED_BOOK_ORDER) {
    const line = gameLines.find((o) => o.book_id === bookId);
    if (line) return line;
  }
  return undefined;
}

export function extractActionNetworkOddsContext(anGame: AnGame): Partial<GameContext> | null {
  const gameLines = (anGame.odds ?? []).filter((o) => o.type === 'game');
  if (!gameLines.length) return null;

  const preferred = pickPreferredBookLine(gameLines);
  if (!preferred) return null;
  const awayTeam = teamById(anGame.teams, anGame.away_team_id);
  const homeTeam = teamById(anGame.teams, anGame.home_team_id);
  if (!awayTeam || !homeTeam) return null;

  const awaySpread = preferred.spread_away;
  const homeSpread = preferred.spread_home;
  const parts: string[] = [];

  if (awaySpread != null) {
    parts.push(`${awayTeam.full_name} ${awaySpread > 0 ? `+${awaySpread}` : awaySpread}`);
  }
  if (homeSpread != null) {
    parts.push(`${homeTeam.full_name} ${homeSpread > 0 ? `+${homeSpread}` : homeSpread}`);
  }

  if (!parts.length && preferred.total == null) return null;

  return {
    oddsSpread: parts.length ? parts.join(' · ') : undefined,
    oddsTotal: preferred.total != null ? `O/U ${preferred.total}` : undefined,
    oddsBook: BOOK_LABELS[preferred.book_id] ?? 'ACTION',
    priority: 180,
  };
}

/** Free odds enrichment from Action Network — runs before any paid odds API. */
export async function enrichGamesWithActionNetworkOdds(
  games: Game[],
  sport: EngineSport,
): Promise<Game[]> {
  const needing = filterGamesNeedingOdds(games, (g) => isRelevantGame(g, sport));
  if (!needing.length) return games;

  const anGames = await fetchActionNetworkGames(sport);
  if (!anGames.length) return games;

  return games.map((game) => {
    if (!isRelevantGame(game, sport) || gameHasOddsContext(game)) return game;
    const anGame = matchActionNetworkGame(anGames, game);
    if (!anGame) return game;
    const ctx = extractActionNetworkOddsContext(anGame);
    return ctx ? enrichGameContext(game, ctx) : game;
  });
}

/** Merge ESPN games with Action Network scores, broadcast, linescores, and odds. */
export async function mergeActionNetworkScoreboard(
  sport: EngineSport,
  games: Game[],
): Promise<Game[]> {
  const league = getActionNetworkLeague(sport);
  if (!league) return games;

  const raw = await fetchActionNetworkScoreboard(league);
  const anList = mapActionNetworkGames(raw ?? {}, league);
  if (!anList.length) return games;

  return mergeScoreboardGames(games, anList, sport);
}
