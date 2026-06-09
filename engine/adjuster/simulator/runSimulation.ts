import type { Game } from '../../../types';
import { hasBlockingIssues, validateGames, type ParseInvariantIssue } from '../invariants';
import { getGoldenFixtureById, loadGoldenFixture, parseGoldenFixture } from '../fixtureTestUtils';
import type { ChaosScenario } from './scenarios';

export interface SimulationResult {
  scenarioId: string;
  fixtureId: string;
  description: string;
  recovered: boolean;
  games: Game[];
  issues: ParseInvariantIssue[];
  parseRate: number;
  expectedRecovery: boolean;
  failureReason?: string;
}

export function runChaosScenario(scenario: ChaosScenario): SimulationResult {
  const entry = getGoldenFixtureById(scenario.fixtureId);
  const baseline = loadGoldenFixture(entry.file);
  const mutated = scenario.mutate(baseline);
  const games = parseGoldenFixture(entry.parser, entry.sport, mutated);
  const issues = validateGames(games, entry.sport);
  const parseRate = games.length > 0 ? 1 : 0;
  const minGames = scenario.minGames ?? entry.minGames;

  let recovered = false;
  let failureReason: string | undefined;

  if (scenario.expectRecovery) {
    if (games.length < minGames) {
      failureReason = `expected >= ${minGames} games, got ${games.length}`;
    } else if (hasBlockingIssues(issues)) {
      failureReason = `invariant errors: ${issues.filter((i) => i.severity === 'error').map((i) => i.code).join(', ')}`;
    } else {
      recovered = true;
    }
  } else if (scenario.expectZeroGames) {
    recovered = games.length === 0;
    if (!recovered) failureReason = `expected 0 games, got ${games.length}`;
  } else {
    const codes = issues.map((i) => i.code);
    const expected = scenario.expectedIssueCodes ?? [];
    const hit = expected.every((code) => codes.includes(code));
    const blocked = hasBlockingIssues(issues);
    recovered = blocked && (expected.length === 0 || hit);
    if (!recovered) {
      failureReason = expected.length
        ? `expected issues [${expected.join(', ')}], got [${codes.join(', ')}]`
        : 'expected blocking invariant failure';
    }
  }

  return {
    scenarioId: scenario.id,
    fixtureId: scenario.fixtureId,
    description: scenario.description,
    recovered,
    games,
    issues,
    parseRate,
    expectedRecovery: scenario.expectRecovery,
    failureReason,
  };
}

export function runAllChaosScenarios(scenarios: ChaosScenario[]): SimulationResult[] {
  return scenarios.map(runChaosScenario);
}

export function summarizeSimulations(results: SimulationResult[]): {
  total: number;
  passed: number;
  failed: SimulationResult[];
} {
  const failed = results.filter((r) => !r.recovered);
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed,
  };
}
