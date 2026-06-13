import { describe, expect, it } from 'vitest';
import { fuzzyResolveField } from '../fuzzyResolver';

describe('fuzzyResolver', () => {
  it('matches renamed scoring container to score field', () => {
    const comp = { scorng: { displayValue: '42' } };
    const match = fuzzyResolveField(comp, 'score');
    expect(match?.value).toBe('42');
  });

  it('matches points key alias', () => {
    const comp = { points: '17' };
    const match = fuzzyResolveField(comp, 'score');
    expect(match?.value).toBe('17');
  });

  it('returns null when no plausible key exists', () => {
    expect(fuzzyResolveField({ foo: 'bar' }, 'score')).toBeNull();
  });
});
