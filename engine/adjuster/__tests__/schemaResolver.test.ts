import { describe, expect, it, beforeEach } from 'vitest';
import { resolveFieldWaterfall } from '../schemaResolver';
import { resetCdnAliasOverlay } from '../cdnAliases';
import { ESPN_COMPETITOR_ALIASES } from '../registry';

describe('schemaResolver', () => {
  beforeEach(() => {
    resetCdnAliasOverlay();
  });

  it('resolves from registry first', () => {
    const comp = { score: { displayValue: '99' } };
    const result = resolveFieldWaterfall(comp, ESPN_COMPETITOR_ALIASES.score, {
      canonicalField: 'score',
      fuzzyParent: comp,
    });
    expect(result.value).toBe('99');
    expect(result.source).toBe('registry');
  });

  it('falls back to fuzzy when registry misses', () => {
    const comp = { scorng: { displayValue: '55' } };
    const result = resolveFieldWaterfall(comp, ESPN_COMPETITOR_ALIASES.score, {
      canonicalField: 'score',
      fuzzyParent: comp,
    });
    expect(result.value).toBe('55');
    expect(result.source).toBe('fuzzy');
  });
});
