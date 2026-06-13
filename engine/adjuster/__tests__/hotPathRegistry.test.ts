import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fuzzyModule from '../fuzzyResolver';
import { resolveFieldWaterfall } from '../schemaResolver';
import { resetCdnAliasOverlay } from '../cdnAliases';
import { ESPN_COMPETITOR_ALIASES } from '../registry';
import {
  getHotPathStats,
  promoteToRegistry,
  resetHotPathRegistry,
  evictStaleHotPaths,
  getHotPathPaths,
} from '../hotPathRegistry';
import { loadGoldenFixture } from '../fixtureTestUtils';
import { CHAOS_SCENARIOS } from '../simulator/scenarios';

describe('hotPathRegistry', () => {
  beforeEach(() => {
    resetHotPathRegistry();
    resetCdnAliasOverlay();
  });

  it('promotes fuzzy discovery and resolves via registry on second pass', () => {
    const comp = { scorng: { displayValue: '55' } };
    const paths = ESPN_COMPETITOR_ALIASES.score;

    const pass1 = resolveFieldWaterfall(comp, paths, {
      canonicalField: 'score',
      fuzzyParent: comp,
    });
    expect(pass1.source).toBe('fuzzy');
    expect(pass1.value).toBe('55');
    expect(getHotPathStats().promotions).toBe(1);

    const fuzzySpy = vi.spyOn(fuzzyModule, 'fuzzyResolveField');
    const pass2 = resolveFieldWaterfall(comp, paths, {
      canonicalField: 'score',
      fuzzyParent: comp,
    });
    expect(pass2.source).toBe('registry');
    expect(pass2.value).toBe('55');
    expect(fuzzySpy).not.toHaveBeenCalled();
    expect(getHotPathStats().hits).toBeGreaterThanOrEqual(1);
  });

  it('score-fuzzy-rename chaos fixture: poll 1 fuzzy, poll 2 registry', () => {
    const scenario = CHAOS_SCENARIOS.find((s) => s.id === 'score-fuzzy-rename')!;
    const raw = loadGoldenFixture('basketball/score-moved.json');
    const mutated = scenario.mutate(raw) as { competitions: { competitors: unknown[] }[] };
    const comp = mutated.competitions[0].competitors[0];
    const paths = ESPN_COMPETITOR_ALIASES.score;

    const pass1 = resolveFieldWaterfall(comp, paths, {
      canonicalField: 'score',
      fuzzyParent: comp,
      scopeKey: 'BASKETBALL',
    });
    expect(pass1.source).toBe('fuzzy');

    const fuzzySpy = vi.spyOn(fuzzyModule, 'fuzzyResolveField');
    const pass2 = resolveFieldWaterfall(comp, paths, {
      canonicalField: 'score',
      fuzzyParent: comp,
      scopeKey: 'BASKETBALL',
    });
    expect(pass2.source).toBe('registry');
    expect(fuzzySpy).not.toHaveBeenCalled();
  });

  it('evicts stale hot path when field moves again', () => {
    const comp = { scorng: { displayValue: '10' } };
    promoteToRegistry('score', ['scorng', 'displayValue'], 'fuzzy', '10');
    expect(getHotPathPaths('score')).toHaveLength(1);

    const moved = { points: '20' };
    evictStaleHotPaths(moved, 'score');
    expect(getHotPathPaths('score')).toHaveLength(0);

    const result = resolveFieldWaterfall(moved, ESPN_COMPETITOR_ALIASES.score, {
      canonicalField: 'score',
      fuzzyParent: moved,
    });
    expect(result.source).toBe('fuzzy');
    expect(result.value).toBe('20');
  });

  it('rejects invalid promoted values', () => {
    expect(promoteToRegistry('score', ['bad'], 'fuzzy', undefined)).toBe(false);
    expect(promoteToRegistry('teamName', ['x'], 'fuzzy', '   ')).toBe(false);
    expect(getHotPathStats().promotions).toBe(0);
  });
});
