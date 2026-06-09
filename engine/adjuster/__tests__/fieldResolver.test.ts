import { describe, expect, it } from 'vitest';
import { deepGet, resolveFirst, resolveWithTrace } from '../fieldResolver';
import { ESPN_COMPETITOR_ALIASES } from '../registry';

describe('fieldResolver', () => {
  const comp = {
    score: { displayValue: '105' },
    team: { displayName: 'Lakers', abbreviation: 'LAL' },
  };

  it('deepGet walks nested paths', () => {
    expect(deepGet(comp, ['team', 'abbreviation'])).toBe('LAL');
    expect(deepGet(comp, ['missing', 'path'])).toBeUndefined();
  });

  it('resolveFirst prefers leaf paths over container objects', () => {
    expect(resolveFirst(comp, ESPN_COMPETITOR_ALIASES.score)).toBe('105');
    expect(resolveFirst({ scoring: { displayValue: '42' } }, ESPN_COMPETITOR_ALIASES.score)).toBe('42');
  });

  it('resolveWithTrace reports which path matched', () => {
    const { value, path } = resolveWithTrace(comp, ESPN_COMPETITOR_ALIASES.teamName);
    expect(value).toBe('Lakers');
    expect(path).toEqual(['team', 'displayName']);
  });
});
