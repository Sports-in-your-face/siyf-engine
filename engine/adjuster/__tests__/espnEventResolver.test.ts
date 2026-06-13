import { describe, expect, it, beforeEach } from 'vitest';
import { getDlqEntry, resetFieldDlq } from '../dlq';
import { resetParseTelemetry } from '../telemetry';
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

  beforeEach(() => {
    resetParseTelemetry();
    resetFieldDlq();
  });

  it('resolves status state from event', () => {
    expect(resolveEspnStatusState(event)).toBe('in');
    expect(resolveEspnEventField(event, 'leagueAbbr')).toBe('NBA');
    expect(resolveEspnDisplayClock(event)).toBe('4:32');
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

  it('sniffs displayClock when registry path is missing', () => {
    const sniffable = {
      status: { type: { shortDetail: 'Q3' }, remainingTime: '8:15' },
    };
    expect(resolveEspnDisplayClock(sniffable)).toBe('8:15');
  });

  it('records DLQ when clock cannot be resolved', () => {
    resolveEspnDisplayClock({ status: { type: { shortDetail: 'Q3' } } }, undefined, {
      sport: 'BASKETBALL',
      gameId: '401',
    });
    expect(getDlqEntry('BASKETBALL:displayClock:401')?.occurrenceCount).toBe(1);
  });
});
