import { describe, expect, it } from 'vitest';
import { loadGoldenFixture } from '../../adjuster/fixtureTestUtils';
import { espnAdapter } from '../adapters/espn';
import {
  resolveEspnDisplayClock,
  resolveEspnEventField,
  resolveEspnStatusState,
} from '../../adjuster/espnEventResolver';
import { resolveEspnCompetitorField } from '../../adjuster/espnResolver';
import {
  resolveCompetitorField,
  resolveDisplayClock,
  resolveEventField,
  resolveStatusState,
} from '../router';

describe('espnAdapter ACL parity', () => {
  const event = loadGoldenFixture('basketball/live-standard.json') as Record<string, unknown>;
  const competition = (event.competitions as unknown[])?.[0];

  it('matches direct ESPN resolver for event fields', () => {
    expect(resolveEventField(event, 'leagueAbbr')).toBe(resolveEspnEventField(event, 'leagueAbbr'));
    expect(resolveStatusState(event, competition)).toBe(resolveEspnStatusState(event, competition));
    expect(resolveDisplayClock(event, competition)).toBe(resolveEspnDisplayClock(event, competition));
  });

  it('matches direct ESPN resolver for competitor fields', () => {
    const comp = (competition as { competitors?: unknown[] })?.competitors?.[0];
    expect(resolveCompetitorField(comp, 'teamName')).toBe(resolveEspnCompetitorField(comp, 'teamName'));
    expect(resolveCompetitorField(comp, 'score')).toBe(resolveEspnCompetitorField(comp, 'score'));
  });

  it('espnAdapter canHandle recognizes ESPN events', () => {
    expect(espnAdapter.canHandle(event)).toBe(true);
    expect(espnAdapter.canHandle({ foo: 'bar' })).toBe(false);
  });
});
