import { describe, expect, it } from 'vitest';
import type { UpstreamAdapter } from '../types';

export function createMockAdapter(
  overrides: Partial<UpstreamAdapter> & Pick<UpstreamAdapter, 'id'>,
): UpstreamAdapter {
  return {
    priority: 99,
    canHandle: () => true,
    resolveEventField: () => undefined,
    resolveEventFieldWithTrace: () => ({
      value: undefined,
      path: null,
      source: 'none',
      provider: overrides.id,
    }),
    resolveCompetitorField: () => undefined,
    resolveCompetitorFieldWithTrace: () => ({
      value: undefined,
      path: null,
      source: 'none',
      provider: overrides.id,
    }),
    resolveStatusState: () => undefined,
    resolveDisplayClock: () => undefined,
    ...overrides,
  };
}

describe('UpstreamAdapter contract', () => {
  it('mock adapter satisfies interface', () => {
    const adapter = createMockAdapter({
      id: 'espn',
      priority: 0,
      resolveEventField: () => 'nba',
    });
    expect(adapter.canHandle({ id: '1' })).toBe(true);
    expect(adapter.resolveEventField({}, 'leagueAbbr')).toBe('nba');
  });
});
