import type { Game } from '../types';

/** Drop finished/unknown games older than this from scoreboard feeds. */
export const MAX_FEED_AGE_MS = 2 * 86_400_000;

function getGameStartMs(game: Game): number | null {
  const iso = game.timing?.startTime;
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

const STALE_PRE_MS = 6 * 3_600_000;

/** True when a game should appear in live scoreboard / bookmark feeds. */
export function isGameWithinFeedWindow(game: Game, now = new Date()): boolean {
  const nowMs = now.getTime();
  const startMs = getGameStartMs(game);

  if (game.statusState === 'in') return true;

  if (game.statusState === 'pre') {
    if (startMs == null) return true;
    if (startMs > nowMs) return true;
    return nowMs - startMs <= STALE_PRE_MS;
  }

  if (startMs == null) return false;
  if (startMs > nowMs) return true;

  return nowMs - startMs <= MAX_FEED_AGE_MS;
}

export function filterRecentGames(games: Game[], now = new Date()): Game[] {
  return games.filter((game) => isGameWithinFeedWindow(game, now));
}
