import type { Game } from '../../types';
import { recordParseBatch, type ParseBatchReport } from './adjuster';

export interface ParserBatchStats {
  rawCount: number;
  skipped: number;
}

/** Track parse attempts across nested loops (tennis groupings, fight cards, etc.). */
export class ParseBatchAccumulator {
  rawCount = 0;
  skipped = 0;

  recordAttempt(success: boolean): void {
    this.rawCount += 1;
    if (!success) this.skipped += 1;
  }

  finish(sport: string, games: Game[]): ParseBatchReport {
    return finishParserBatch(sport, games, this);
  }
}

export function finishParserBatch(
  sport: string,
  games: Game[],
  stats: ParserBatchStats,
): ParseBatchReport {
  return recordParseBatch({
    sport,
    rawCount: stats.rawCount,
    parsed: games,
    skipped: stats.skipped,
  });
}
