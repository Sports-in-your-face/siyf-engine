import type { Game } from '../../../types';
import type { ParseInvariantIssue } from './types';

function isObjectLeak(value: unknown): boolean {
  return typeof value === 'string' && value.includes('[object Object]');
}

function isMalformedOddsField(value: unknown): boolean {
  return value != null && typeof value !== 'string';
}

/** Post-merge odds display gates — catches object leaks and non-string odds fields. */
export function validateGameOdds(game: Game): ParseInvariantIssue[] {
  const ctx = game.context;
  if (!ctx) return [];

  const issues: ParseInvariantIssue[] = [];
  const fields: Array<{ key: 'oddsSpread' | 'oddsTotal' | 'oddsBook'; code: string }> = [
    { key: 'oddsSpread', code: 'odds.malformed_spread' },
    { key: 'oddsTotal', code: 'odds.malformed_total' },
    { key: 'oddsBook', code: 'odds.malformed_book' },
  ];

  for (const { key, code } of fields) {
    const value = ctx[key];
    if (isMalformedOddsField(value)) {
      issues.push({
        code,
        message: `${key} must be a display string, got ${typeof value}`,
        severity: 'error',
        field: `context.${key}`,
        gameId: game.id,
      });
    } else if (isObjectLeak(value)) {
      issues.push({
        code: 'odds.object_leak',
        message: `${key} contains "[object Object]" leak`,
        severity: 'error',
        field: `context.${key}`,
        gameId: game.id,
      });
    }
  }

  const hasLine = Boolean(ctx.oddsSpread || ctx.oddsTotal);
  if (hasLine && !ctx.oddsBook) {
    issues.push({
      code: 'odds.book_missing',
      message: 'Odds line present without sportsbook label',
      severity: 'warn',
      field: 'context.oddsBook',
      gameId: game.id,
    });
  }

  return issues;
}

export function validateGamesOdds(games: Game[]): ParseInvariantIssue[] {
  return games.flatMap(validateGameOdds);
}
