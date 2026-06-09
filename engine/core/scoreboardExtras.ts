import { createEngineLog, safeTryAsync } from './engineUtils';

const log = createEngineLog('scoreboard-extras');

/** Run an optional scoreboard enrichment step without failing the whole pipeline. */
export function tryScoreboardStep<T>(
  sport: string,
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  return safeTryAsync(log, sport, label, fn, fallback);
}
