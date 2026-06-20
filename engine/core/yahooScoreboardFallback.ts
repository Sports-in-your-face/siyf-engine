import { createEngineLog, safeTryAsync } from './engineUtils';
import { gameMissingScores } from './paidApiPolicy';
import {
  fetchYahooGamesForSport,
  supportsYahooScoreFallback,
} from '../sources/yahooScoreboardSource';
import type { Game } from '../../types';
import type { DataSource } from './types';
import type { EngineSport } from '../sportConfig';

const log = createEngineLog('yahoo-fallback');

/**
 * Yahoo Sports scoreboard — free fallback when ESPN is empty or live scores are missing.
 * Uses the trending mixed-sport feed and filters to the active engine sport tab.
 */
export async function tryYahooScoreboardFallback(
  sport: EngineSport,
  games: Game[],
  sources: DataSource[],
): Promise<{ games: Game[]; sources: DataSource[] }> {
  if (!supportsYahooScoreFallback(sport)) return { games, sources };

  if (!games.length) {
    const primary = await safeTryAsync(
      log,
      'tryYahooScoreboardFallback',
      `${sport} primary`,
      () => fetchYahooGamesForSport(sport),
      [],
    );
    if (!primary.length) return { games, sources };
    return { games: primary, sources: [...sources, 'yahoo'] };
  }

  if (!games.some(gameMissingScores)) return { games, sources };

  const merged = await safeTryAsync(
    log,
    'tryYahooScoreboardFallback',
    `${sport} score merge`,
    async () => {
      const { mergeYahooScoreboard: merge } = await import('../sources/yahooScoreboardSource');
      return merge(sport, games);
    },
    null,
  );
  if (!merged) return { games, sources };

  return {
    games: merged,
    sources: sources.includes('yahoo') ? sources : [...sources, 'yahoo'],
  };
}
