import { describe, expect, it, beforeEach } from 'vitest';
import { resetParseTelemetry } from '../telemetry';
import { resetHotPathRegistry } from '../hotPathRegistry';
import { CHAOS_SCENARIOS } from '../simulator/scenarios';
import { runAllChaosScenarios, runChaosScenario, summarizeSimulations } from '../simulator/runSimulation';
import { cloneFixture, moveField, wrapInObject, awayScorePath } from '../simulator/mutations';
import { loadGoldenFixture } from '../fixtureTestUtils';

describe('chaos mutations', () => {
  it('wrapInObject preserves value under displayValue', () => {
    const raw = { competitions: [{ competitors: [{ score: '99' }] }] };
    const next = cloneFixture(raw);
    wrapInObject(next, ['competitions', 0, 'competitors', 0, 'score']);
    expect((next as any).competitions[0].competitors[0].score).toEqual({ displayValue: '99' });
  });

  it('moveField relocates a leaf', () => {
    const raw = { competitions: [{ competitors: [{ score: '42' }] }] };
    const next = cloneFixture(raw);
    moveField(next, awayScorePath(), ['competitions', 0, 'competitors', 0, 'scoring', 'displayValue']);
    expect((next as any).competitions[0].competitors[0].score).toBeUndefined();
    expect((next as any).competitions[0].competitors[0].scoring.displayValue).toBe('42');
  });
});

describe('chaos scenarios', () => {
  beforeEach(() => {
    resetParseTelemetry();
    resetHotPathRegistry();
  });

  it('defines recoverable and intentional failure scenarios', () => {
    const recoverable = CHAOS_SCENARIOS.filter((s) => s.expectRecovery);
    const failures = CHAOS_SCENARIOS.filter((s) => !s.expectRecovery);
    expect(recoverable.length).toBeGreaterThanOrEqual(6);
    expect(failures.length).toBeGreaterThanOrEqual(2);
  });

  for (const scenario of CHAOS_SCENARIOS) {
    it(`${scenario.id}: ${scenario.description}`, () => {
      const result = runChaosScenario(scenario);
      expect(result.recovered, result.failureReason ?? 'no reason').toBe(true);
    });
  }

  it('full chaos suite passes', () => {
    const results = runAllChaosScenarios(CHAOS_SCENARIOS);
    const summary = summarizeSimulations(results);
    if (summary.failed.length) {
      const detail = summary.failed.map((f) => `${f.scenarioId}: ${f.failureReason}`).join('\n');
      expect(summary.failed, detail).toEqual([]);
    }
    expect(summary.passed).toBe(CHAOS_SCENARIOS.length);
  });

  it('baseline fixture differs from mutated output', () => {
    const scenario = CHAOS_SCENARIOS.find((s) => s.id === 'score-move-scoring')!;
    const raw = loadGoldenFixture('basketball/live-standard.json');
    const mutated = scenario.mutate(raw);
    expect(mutated).not.toEqual(raw);
  });
});
