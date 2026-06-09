import type { Game, PlayerDetails } from '../../types';
import type { GameDetail } from './types';

/**
 * Paid API last-resort policy (BDL, SPORTS, ODDS, SGO).
 *
 * Chrome engine touchpoints:
 * - Scores: paidApiFallback.enrichTeamSportScoreboard → BDL for NBA (after ESPN + Action Network)
 * - Odds:   *OddsSources.enrich*GamesWithOdds → /api/odds (after Action Network for NBA)
 * - Props:  fantasySources.fetchDraftKingsProps → /api/odds (lastResort player provider)
 * - Props:  *OddsSources.fetch*FanDuelTopPerformers → /api/odds (after ESPN top performers)
 *
 * Not yet wired in chrome: /api/sports, /api/basketball, /api/sgo (SGO falls back inside SIYF-API proxy).
 *
 * Odds caching: 10 min fresh TTL (client + edge) via `fetchCachedPaidOdds` / `odds` cache tier.
 *
 * Session telemetry: resilientFetch logs `[paid-api-used]` to the console; inspect via `__siyfPaidApi.getCounts()`.
 */

/** Upstream APIs that consume paid quota — always try free sources first. */
export const PAID_API_SOURCE_IDS = new Set([
  'balldontlie',
  'bdl',
  'odds-api',
  'odds',
  'sgo',
  'sports-api',
  'api-sports',
  'basketball-api',
  'fanduel',
  'draftkings',
]);

const REFERENCE_PLAYER_PROVIDERS = new Set([
  'basketball_reference',
  'pro_football_reference',
  'baseball_reference',
  'hockey_reference',
  'fbref',
]);

export function isPaidApiSource(source: string): boolean {
  return PAID_API_SOURCE_IDS.has(source);
}

// ── Odds ─────────────────────────────────────────────────────────────────────

export function gameHasOddsContext(game: Game): boolean {
  const ctx = game.context;
  if (!ctx?.oddsSpread && !ctx?.oddsTotal) return false;
  if (ctx.oddsBook?.toUpperCase() === 'CONSENSUS') return false;
  return true;
}

export function filterGamesNeedingOdds(
  games: Game[],
  isRelevant: (game: Game) => boolean,
): Game[] {
  return games.filter((g) => isRelevant(g) && !gameHasOddsContext(g));
}

export function detailNeedsOdds(detail: GameDetail): boolean {
  return !gameHasOddsContext(detail);
}

// ── Scores ───────────────────────────────────────────────────────────────────

export function gameMissingScores(game: Game): boolean {
  if (game.statusState !== 'in') return false;
  const away = game.away.score;
  const home = game.home.score;
  return away == null || away === '' || home == null || home === '';
}

export function gamesNeedingScoreFallback(games: Game[]): Game[] {
  return games.filter(gameMissingScores);
}

function isNbaScoreboardGame(game: Game): boolean {
  const s = game.sport;
  if (!s) return true;
  return s === 'NBA' || s === 'BASKETBALL';
}

/** BDL scoreboard — only after free score sources (ESPN, Action Network) still have gaps. */
export function shouldFetchBdlScoreboard(games: Game[]): boolean {
  const nbaNeedingScores = gamesNeedingScoreFallback(games).filter(isNbaScoreboardGame);
  if (nbaNeedingScores.length > 0) return true;
  if (!games.length) return true;
  return false;
}

// ── Box score / top performers ───────────────────────────────────────────────

export function detailHasTopPerformers(game: Game): boolean {
  return Boolean(game.topPerformers?.length);
}

export function detailNeedsTopPerformers(game: Game): boolean {
  return !detailHasTopPerformers(game);
}

// ── Player stats ─────────────────────────────────────────────────────────────

export function playerHasSeasonHistory(detail: PlayerDetails): boolean {
  return Boolean(detail.seasonHistory?.length);
}

export function shouldRunPlayerDetailProvider(id: string, detail: PlayerDetails): boolean {
  if (REFERENCE_PLAYER_PROVIDERS.has(id) && playerHasSeasonHistory(detail)) {
    return false;
  }
  return shouldRunPaidPlayerProvider(id, detail);
}

export function shouldRunPaidPlayerProvider(id: string, detail: PlayerDetails): boolean {
  if (id === 'draftkings') {
    return !detail.seasonSplits?.some((s) => /draftkings/i.test(s.name ?? ''));
  }
  return true;
}
