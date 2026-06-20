import { describe, expect, it } from 'vitest';
import {
  resolveEspnDisplayClock,
  resolveEspnEventField,
  resolveEspnStatusState,
} from '../espnEventResolver';

describe('espnEventResolver', () => {
  const event = {
    id: '401',
    status: { type: { state: 'in', shortDetail: 'Q3', detail: '3rd Quarter' }, displayClock: '4:32' },
    leagues: [{ abbreviation: 'NBA', slug: 'nba' }],
  };

  it('resolves status state from event', () => {
    expect(resolveEspnStatusState(event)).toBe('in');
    expect(resolveEspnEventField(event, 'leagueAbbr')).toBe('NBA');
  });

  it('falls back to competition-level status paths', () => {
    const competition = {
      status: { type: { state: 'post', shortDetail: 'Final', detail: 'Final' }, displayClock: '0:00' },
      league: { abbreviation: 'WNBA', slug: 'wnba' },
    };
    expect(resolveEspnStatusState({}, competition)).toBe('post');
    expect(resolveEspnDisplayClock({}, competition)).toBe('0:00');
    expect(resolveEspnEventField({ competitions: [competition] }, 'leagueAbbr')).toBe('WNBA');
  });
});
