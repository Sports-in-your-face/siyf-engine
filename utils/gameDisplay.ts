import type { Game } from '../types';
import { coerceDisplayString } from './coerce';
import { extractGameOdds } from './gameMeta';
import { isScoreboardNoiseText } from './scoreboardNoise';

/** Strip misleading subtitles that leaked from RSS/odds enrichment. */
export function displaySubtitle(game: Game): string | undefined {
  const sub = coerceDisplayString(game.subtitle);
  if (!sub) return undefined;

  if (isScoreboardNoiseText(sub)) return undefined;

  const lower = sub.toLowerCase();
  const isFinals = game.context?.phase === 'finals';

  if (!isFinals && (/nba finals|^finals game/i.test(lower) || /mvp rankings/i.test(lower))) {
    return undefined;
  }
  if (/^o\/u \d/i.test(lower) && extractGameOdds(game)) return undefined;

  return sub;
}

/** Avoid showing duplicate status + clock in card headers. */
export function cardClockDisplay(
  status: string,
  displayClock: string,
  statusState?: 'pre' | 'in' | 'post',
): string | null {
  if (statusState === 'post') return null;
  const a = status.trim().toLowerCase();
  const b = displayClock.trim().toLowerCase();
  if (!b || a === b) return null;
  if (a.includes(b) || b.includes(a)) return null;
  return displayClock;
}

/** Prefer abbr for tight layouts; full name as tooltip. */
export function teamDisplayName(name: unknown, abbr: unknown, maxLen = 14): string {
  const n = coerceDisplayString(name, coerceDisplayString(abbr, '—'));
  const a = coerceDisplayString(abbr, '—');
  if (n.length <= maxLen) return n;
  return a.length >= 2 ? a : n;
}

export function displayScoreValue(score: number | string | null | undefined): string {
  if (score === null || score === undefined) return '-';
  return coerceDisplayString(score, '-');
}
