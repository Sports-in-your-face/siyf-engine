import type { Game } from '../types';

/** ESPN / broadcast labels for games that will not be played. */
const VOID_STATUS_TEXT = /\b(cancel+ed|postponed|suspended|forfeit|forfeited|abandoned|voided|ppd)\b/i;

const VOID_ESPN_TYPE_NAMES = new Set([
  'STATUS_CANCELED',
  'STATUS_CANCELLED',
  'STATUS_POSTPONED',
  'STATUS_SUSPENDED',
  'STATUS_FORFEIT',
  'STATUS_FORFEITED',
  'STATUS_ABANDONED',
]);

export function winsToClinchSeries(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

export function isVoidStatusText(...parts: Array<string | undefined>): boolean {
  const text = parts.filter(Boolean).join(' ').trim();
  return text.length > 0 && VOID_STATUS_TEXT.test(text);
}

export function isVoidEspnStatus(input: {
  typeName?: string;
  shortDetail?: string;
  detail?: string;
  status?: string;
}): boolean {
  const typeName = input.typeName?.trim().toUpperCase();
  if (typeName && VOID_ESPN_TYPE_NAMES.has(typeName)) return true;
  return isVoidStatusText(input.shortDetail, input.detail, input.status);
}

export function isVoidGame(game: Pick<Game, 'status' | 'statusState'>): boolean {
  return isVoidStatusText(game.status);
}

function parseWinsFromSeriesRecord(record?: string): number | undefined {
  if (!record) return undefined;
  const match = record.trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!match) return undefined;
  const wins = parseInt(match[1], 10);
  return Number.isNaN(wins) ? undefined : wins;
}

function parseSeriesWinsFromSummary(
  summary: string | undefined,
  awayAbbr: string,
  homeAbbr: string,
): { away?: number; home?: number } {
  if (!summary) return {};
  const match = summary.match(/(\w+)\s+(\d+)\s*[-–]\s*(\d+)\s+(\w+)/i);
  if (!match) {
    const score = summary.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (!score) return {};
    const w1 = parseInt(score[1], 10);
    const w2 = parseInt(score[2], 10);
    if (Number.isNaN(w1) || Number.isNaN(w2)) return {};
    const lower = summary.toLowerCase();
    if (lower.includes(awayAbbr.toLowerCase())) return { away: w1, home: w2 };
    if (lower.includes(homeAbbr.toLowerCase())) return { home: w1, away: w2 };
    return { away: w1, home: w2 };
  }

  const [, team1, wins1, wins2, team2] = match;
  const w1 = parseInt(wins1, 10);
  const w2 = parseInt(wins2, 10);
  if (team1.toUpperCase() === awayAbbr.toUpperCase()) return { away: w1, home: w2 };
  if (team2.toUpperCase() === awayAbbr.toUpperCase()) return { away: w2, home: w1 };
  if (team1.toUpperCase() === homeAbbr.toUpperCase()) return { home: w1, away: w2 };
  if (team2.toUpperCase() === homeAbbr.toUpperCase()) return { home: w2, away: w1 };
  return {};
}

/** True when a playoff/finals series is already clinched. */
export function isPlayoffSeriesDecided(game: Game): boolean {
  const phase = game.context?.phase;
  if (phase !== 'playoffs' && phase !== 'finals') return false;

  let away = game.context?.awaySeriesWins;
  let home = game.context?.homeSeriesWins;

  if (away == null || home == null) {
    const fromSummary = parseSeriesWinsFromSummary(
      game.context?.seriesSummary,
      game.away.abbr,
      game.home.abbr,
    );
    away = away ?? fromSummary.away;
    home = home ?? fromSummary.home;
  }

  if (away == null || home == null) {
    const awayRec = parseWinsFromSeriesRecord(game.context?.awaySeriesRecord);
    const homeRec = parseWinsFromSeriesRecord(game.context?.homeSeriesRecord);
    if (awayRec != null && homeRec != null) {
      away = awayRec;
      home = homeRec;
    }
  }

  if (away == null || home == null) return false;

  const bestOf = game.context?.seriesLength ?? 7;
  const needed = winsToClinchSeries(bestOf);
  return away >= needed || home >= needed;
}

/**
 * Games that should never appear on the live scoreboard feed.
 * Covers cancelled/postponed matchups and unplayed games after a series ends.
 */
export function shouldHideFromScoreboard(game: Game): boolean {
  if (isVoidGame(game)) return true;
  if (game.statusState === 'pre' && isPlayoffSeriesDecided(game)) return true;
  return false;
}
