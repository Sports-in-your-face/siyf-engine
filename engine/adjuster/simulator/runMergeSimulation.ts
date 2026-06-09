import type { Game } from '../../../types';
import { hasBlockingIssues } from '../invariants';
import type { ParseInvariantIssue } from '../invariants/types';
import type { MergeScenario } from './mergeScenarios';

export interface MergeSimulationResult {
  scenarioId: string;
  description: string;
  recovered: boolean;
  primary: Game[];
  secondary: Game[];
  merged: Game[];
  deduped?: Game[];
  issues: ParseInvariantIssue[];
  expectHealthy: boolean;
  failureReason?: string;
}

export function runMergeScenario(scenario: MergeScenario): MergeSimulationResult {
  const outcome = scenario.run();
  const blocking = hasBlockingIssues(outcome.issues);
  const codes = outcome.issues.map((i) => i.code);
  const expectedCodes = scenario.expectedIssueCodes ?? [];

  let recovered = false;
  let failureReason: string | undefined;

  if (scenario.expectHealthy) {
    if (blocking) {
      failureReason = `unexpected blocking issues: ${outcome.issues.filter((i) => i.severity === 'error').map((i) => i.code).join(', ')}`;
    } else if (expectedCodes.length && !expectedCodes.every((code) => codes.includes(code))) {
      failureReason = `expected issues [${expectedCodes.join(', ')}], got [${codes.join(', ')}]`;
    } else {
      recovered = true;
    }
  } else if (blocking) {
    recovered = expectedCodes.length === 0 || expectedCodes.every((code) => codes.includes(code));
    if (!recovered) {
      failureReason = `expected issues [${expectedCodes.join(', ')}], got [${codes.join(', ')}]`;
    }
  } else {
    failureReason = 'expected blocking merge/odds failure';
  }

  return {
    scenarioId: scenario.id,
    description: scenario.description,
    recovered,
    primary: outcome.primary,
    secondary: outcome.secondary,
    merged: outcome.merged,
    deduped: outcome.deduped,
    issues: outcome.issues,
    expectHealthy: scenario.expectHealthy,
    failureReason,
  };
}

export function runAllMergeScenarios(scenarios: MergeScenario[]): MergeSimulationResult[] {
  return scenarios.map(runMergeScenario);
}

export function summarizeMergeSimulations(results: MergeSimulationResult[]): {
  total: number;
  recovered: number;
  failed: number;
  failedIds: string[];
} {
  const failed = results.filter((r) => !r.recovered);
  return {
    total: results.length,
    recovered: results.length - failed.length,
    failed: failed.length,
    failedIds: failed.map((r) => r.scenarioId),
  };
}
