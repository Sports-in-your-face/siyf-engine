import type { Game } from '../../types';
import { fetchCdnPauseKeywords, type CdnPauseKeywordsFile } from '../../config/siyfCdn';

export type StatusSignal = 'live' | 'paused' | 'break' | 'scheduled' | 'final';

const DEFAULT_PAUSE_KEYWORDS = [
  'rain delay',
  'rain delayed',
  'delay',
  'delayed',
  'suspended',
  'postponed',
  'weather',
  'lightning',
  'tarp',
  'injury delay',
  'power delay',
] as const;

let cdnPauseOverlay: CdnPauseKeywordsFile | null = null;

export async function loadCdnPauseKeywordsOverlay(): Promise<void> {
  cdnPauseOverlay = await fetchCdnPauseKeywords();
}

export function resetCdnPauseKeywordsOverlay(): void {
  cdnPauseOverlay = null;
}

function pauseKeywordsFor(game: Game): readonly string[] {
  const merged = new Set<string>(DEFAULT_PAUSE_KEYWORDS);
  for (const kw of cdnPauseOverlay?.global ?? []) merged.add(kw);
  const sportKey = game.sport?.toUpperCase();
  if (sportKey) {
    for (const kw of cdnPauseOverlay?.sports?.[sportKey] ?? []) merged.add(kw);
  }
  return [...merged];
}

const BREAK_KEYWORDS = [
  'halftime',
  'half time',
  'half-time',
  'intermission',
  'end of period',
  'between periods',
  'end of quarter',
  'end of half',
  'end of inning',
] as const;

/** Running game clock — MM:SS (not possession or penalty timers). */
const RUNNING_CLOCK_RE = /^\d{1,2}:\d{2}$/;

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function combinedStatusText(game: Game): string {
  return normalizeText(`${game.status} ${game.clock}`);
}

function matchesKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

/** True when clock looks like active in-game time, not a static delay label. */
export function hasActiveClock(game: Game): boolean {
  const clock = normalizeText(game.clock);
  if (!clock || clock === '—' || clock === '-') return false;
  if (RUNNING_CLOCK_RE.test(clock)) return true;

  const status = normalizeText(game.status);
  if (/^(q[1-4]|ot|1st|2nd|3rd|4th|top|bot|bottom|mid)/i.test(clock)) return true;
  if (/^(q[1-4]|ot)\s+\d{1,2}:\d{2}$/i.test(clock)) return true;
  if (/^(top|bot|bottom)\s+\d/i.test(clock)) return true;
  if (status.includes('quarter') && RUNNING_CLOCK_RE.test(status)) return true;

  return false;
}

/** Classify a single payload into a coarse status signal (before hysteresis). */
export function classifyStatusSignal(game: Game): StatusSignal {
  const state = game.statusState ?? 'pre';
  if (state === 'post') return 'final';
  if (state === 'pre') return 'scheduled';

  const text = combinedStatusText(game);
  if (matchesKeyword(text, pauseKeywordsFor(game))) return 'paused';
  if (matchesKeyword(text, BREAK_KEYWORDS)) return 'break';
  if (hasActiveClock(game)) return 'live';

  return 'live';
}

export function statusSignalToChronoState(signal: StatusSignal): import('./chronoState').ChronoState {
  switch (signal) {
    case 'final':
      return 'PAST_FINAL';
    case 'scheduled':
      return 'FUTURE_SCHEDULED';
    case 'paused':
      return 'PRESENT_PAUSED';
    case 'break':
      return 'PRESENT_BREAK';
    case 'live':
    default:
      return 'PRESENT_LIVE';
  }
}
