import type { Game } from '../../types';
import { scoreToNumber } from '../../utils/coerce';
import type { GameLiveState } from './cacheTiers';
import { cacheBustKey, cacheBustTag } from './cache';

export interface GameSnapshot {
  statusState: GameLiveState;
  awayScore: number;
  homeScore: number;
  clock: string;
}

export interface CacheBustOptions {
  resolveDetailKey?: (game: Game) => string;
  resolveSummaryKey?: (game: Game) => string;
}

const lastSeen = new Map<string, GameSnapshot>();

function snapshotFromGame(game: Game): GameSnapshot {
  return {
    statusState: game.statusState ?? 'pre',
    awayScore: scoreToNumber(game.away.score),
    homeScore: scoreToNumber(game.home.score),
    clock: game.clock ?? '',
  };
}

function scoresChanged(a: GameSnapshot, b: GameSnapshot): boolean {
  return a.awayScore !== b.awayScore || a.homeScore !== b.homeScore;
}

function bustGameCaches(game: Game, options: CacheBustOptions): void {
  cacheBustTag(`game:${game.id}`);

  if (options.resolveSummaryKey) {
    cacheBustKey(options.resolveSummaryKey(game));
  }

  if (options.resolveDetailKey) {
    cacheBustKey(options.resolveDetailKey(game));
  }
}

/**
 * Compare scoreboard to last poll; bust only the cache slices that went stale.
 * Live scores always refetch — season stats / schedules stay cached.
 */
export function syncCacheFromScoreboard(
  games: Game[],
  options: CacheBustOptions = {},
): string[] {
  const busted: string[] = [];

  for (const game of games) {
    const id = game.id;
    const next = snapshotFromGame(game);
    const prev = lastSeen.get(id);

    if (!prev) {
      lastSeen.set(id, next);
      continue;
    }

    const stateChanged = prev.statusState !== next.statusState;
    const liveScoreChanged = next.statusState === 'in' && scoresChanged(prev, next);

    if (stateChanged || liveScoreChanged) {
      bustGameCaches(game, options);
      busted.push(id);

      if (prev.statusState === 'in' && next.statusState === 'post') {
        cacheBustTag(`team:${game.away.abbr}`);
        cacheBustTag(`team:${game.home.abbr}`);
      }
    }

    lastSeen.set(id, next);
  }

  const activeIds = new Set(games.map((g) => g.id));
  for (const id of lastSeen.keys()) {
    if (!activeIds.has(id)) lastSeen.delete(id);
  }

  return busted;
}

/** Clear all tracked game state (e.g. sport tab switch). */
export function resetScoreboardSnapshots(): void {
  lastSeen.clear();
}
