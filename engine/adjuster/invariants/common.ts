import type { Game, LeaderboardEntry, Team } from '../../../types';
import { coerceDisplayString } from '../../../utils/coerce';
import type { ParseInvariantIssue } from './types';

export const OBJECT_LEAK = /^\[object Object\]$/i;

export function isLeakedObject(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'object' && !Array.isArray(value)) return true;
  if (typeof value === 'string' && OBJECT_LEAK.test(value)) return true;
  return false;
}

export function validateGameCore(game: Game): ParseInvariantIssue[] {
  const issues: ParseInvariantIssue[] = [];
  const id = game.id ?? 'unknown';

  if (!game.id) {
    issues.push({ code: 'game.id.missing', message: 'Game id missing', severity: 'error' });
  }

  if (!game.statusState || !['pre', 'in', 'post'].includes(game.statusState)) {
    issues.push({
      code: 'game.statusState.invalid',
      message: `Invalid statusState: ${String(game.statusState)}`,
      severity: 'warn',
      field: 'statusState',
      gameId: id,
    });
  }

  if (!game.away || !game.home) {
    issues.push({ code: 'game.sides.missing', message: 'Missing away/home', severity: 'error', gameId: id });
  }

  return issues;
}

export interface CompetitorValidationOptions {
  allowTbd?: boolean;
  allowFieldPlaceholder?: boolean;
}

export function validateCompetitor(
  side: Team,
  label: 'away' | 'home',
  gameId: string,
  options: CompetitorValidationOptions = {},
): ParseInvariantIssue[] {
  const issues: ParseInvariantIssue[] = [];

  if (options.allowFieldPlaceholder && label === 'home' && side.name === 'Field') {
    return issues;
  }

  const name = coerceDisplayString(side.name);
  const nameInvalid = !name || OBJECT_LEAK.test(name) || (!options.allowTbd && name === 'TBD');
  if (nameInvalid) {
    issues.push({
      code: 'team.name.missing',
      message: `${label} team name missing or invalid`,
      severity: 'error',
      field: `${label}.name`,
      gameId,
    });
  }

  const abbr = coerceDisplayString(side.abbr);
  if (!abbr || abbr === '—' || OBJECT_LEAK.test(abbr)) {
    issues.push({
      code: 'team.abbr.missing',
      message: `${label} abbreviation missing`,
      severity: 'warn',
      field: `${label}.abbr`,
      gameId,
    });
  }

  if (isLeakedObject(side.score)) {
    issues.push({
      code: 'team.score.object',
      message: `${label} score is a raw object (needs coercion)`,
      severity: 'error',
      field: `${label}.score`,
      gameId,
    });
  }

  if (side.linescores?.some((value) => isLeakedObject(value))) {
    issues.push({
      code: 'team.linescore.object',
      message: `${label} linescore contains raw object`,
      severity: 'error',
      field: `${label}.linescores`,
      gameId,
    });
  }

  return issues;
}

export function validateLeaderboardEntry(
  entry: LeaderboardEntry,
  index: number,
  gameId: string,
): ParseInvariantIssue[] {
  const issues: ParseInvariantIssue[] = [];
  const prefix = `leaderboard[${index}]`;

  const name = coerceDisplayString(entry.name);
  if (!name || name === 'TBD' || OBJECT_LEAK.test(name)) {
    issues.push({
      code: 'leaderboard.entry.name.missing',
      message: `Leaderboard entry ${index} name missing`,
      severity: 'error',
      field: `${prefix}.name`,
      gameId,
    });
  }

  if (!entry.id) {
    issues.push({
      code: 'leaderboard.entry.id.missing',
      message: `Leaderboard entry ${index} id missing`,
      severity: 'warn',
      field: `${prefix}.id`,
      gameId,
    });
  }

  if (!entry.position || entry.position < 1) {
    issues.push({
      code: 'leaderboard.entry.position.invalid',
      message: `Leaderboard entry ${index} position invalid`,
      severity: 'warn',
      field: `${prefix}.position`,
      gameId,
    });
  }

  if (isLeakedObject(entry.score) || isLeakedObject(entry.toPar)) {
    issues.push({
      code: 'leaderboard.entry.score.object',
      message: `Leaderboard entry ${index} score/toPar is a raw object`,
      severity: 'error',
      field: `${prefix}.score`,
      gameId,
    });
  }

  const hasScore = entry.score != null && entry.score !== '' && entry.score !== '—';
  const hasToPar = entry.toPar != null && entry.toPar !== '' && entry.toPar !== '—';
  if (!hasScore && !hasToPar && entry.name !== 'TBD') {
    issues.push({
      code: 'leaderboard.entry.score.missing',
      message: `Leaderboard entry ${index} missing score and toPar`,
      severity: 'warn',
      field: `${prefix}.score`,
      gameId,
    });
  }

  return issues;
}
