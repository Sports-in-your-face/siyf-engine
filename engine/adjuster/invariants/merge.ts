import type { Game } from '../../../types';
import { dedupeGamesById, gameDedupeKey, gameMatchKey, mergeScoreboardGames } from '../../core/mergeGames';
import { validateGamesOdds } from './odds';
import type { ParseInvariantIssue } from './types';

export interface MergeHealthInput {
  primary: Game[];
  secondary: Game[];
  merged: Game[];
  secondaryLabel?: string;
}

/** Post-merge quality gates for ESPN + Action Network (and similar) scoreboard merges. */
export function validateMergeHealth(input: MergeHealthInput): ParseInvariantIssue[] {
  const issues: ParseInvariantIssue[] = [];
  const label = input.secondaryLabel ?? 'secondary';

  const matchupCounts = new Map<string, number>();
  for (const game of input.merged) {
    const key = gameMatchKey(game.away.abbr, game.home.abbr);
    matchupCounts.set(key, (matchupCounts.get(key) ?? 0) + 1);
  }

  for (const [key, count] of matchupCounts) {
    if (count > 1) {
      issues.push({
        code: 'merge.duplicate_key',
        message: `Duplicate matchup key "${key}" appears ${count} times after merge`,
        severity: 'error',
        field: 'merged',
      });
    }
  }

  const primaryKeys = new Set(
    input.primary.map((g) => gameMatchKey(g.away.abbr, g.home.abbr)),
  );

  for (const game of input.secondary) {
    const hasOdds = Boolean(
      game.context?.oddsSpread
      || game.context?.oddsTotal
      || game.context?.oddsBook,
    );
    if (!hasOdds) continue;

    const key = gameMatchKey(game.away.abbr, game.home.abbr);
    if (!primaryKeys.has(key)) {
      issues.push({
        code: 'merge.orphan_odds',
        message: `${label} odds for ${game.away.abbr}@${game.home.abbr} have no primary feed match`,
        severity: 'warn',
        field: 'context.odds',
        gameId: game.id,
      });
    }
  }

  if (input.primary.length && !input.merged.length) {
    issues.push({
      code: 'merge.empty_result',
      message: 'Merge dropped all primary games',
      severity: 'error',
      field: 'merged',
    });
  }

  return issues;
}

/** Ensures dedupeGamesById leaves at most one row per league/sport scope key. */
export function validateDedupeHealth(games: Game[]): ParseInvariantIssue[] {
  const deduped = dedupeGamesById(games);
  const issues: ParseInvariantIssue[] = [];
  const scopeCounts = new Map<string, number>();

  for (const game of deduped) {
    const key = gameDedupeKey(game);
    scopeCounts.set(key, (scopeCounts.get(key) ?? 0) + 1);
  }

  for (const [key, count] of scopeCounts) {
    if (count > 1) {
      issues.push({
        code: 'merge.duplicate_id',
        message: `Dedupe left duplicate scope key "${key}" (${count} rows)`,
        severity: 'error',
        field: 'deduped',
      });
    }
  }

  return issues;
}

export interface MergePipelineInput {
  primary: Game[];
  secondary: Game[];
  secondaryLabel?: string;
  validateOdds?: boolean;
}

export interface MergePipelineResult {
  merged: Game[];
  mergeIssues: ParseInvariantIssue[];
  oddsIssues: ParseInvariantIssue[];
  allIssues: ParseInvariantIssue[];
  healthy: boolean;
}

/** Full ESPN + secondary merge gate: matchup health + optional odds normalization. */
export function runMergePipeline(input: MergePipelineInput): MergePipelineResult {
  const merged = mergeScoreboardGames(input.primary, input.secondary);
  const mergeIssues = validateMergeHealth({
    primary: input.primary,
    secondary: input.secondary,
    merged,
    secondaryLabel: input.secondaryLabel,
  });
  const oddsIssues = input.validateOdds !== false ? validateGamesOdds(merged) : [];
  const allIssues = [...mergeIssues, ...oddsIssues];
  const healthy = !allIssues.some((i) => i.severity === 'error');

  return { merged, mergeIssues, oddsIssues, allIssues, healthy };
}
