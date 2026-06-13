import { describe, expect, it, beforeEach } from 'vitest';
import { getDlqEntry, recordFieldDlq, resetFieldDlq, shouldEmitDlqAlert } from '../dlq';

describe('fieldDlq', () => {
  beforeEach(() => resetFieldDlq());

  it('deduplicates repeat failures for same game field', () => {
    const input = { sport: 'BASEBALL', gameId: '401', canonicalField: 'displayClock' };
    recordFieldDlq(input);
    recordFieldDlq(input);
    recordFieldDlq(input);

    const entry = getDlqEntry('BASEBALL:displayClock:401');
    expect(entry?.occurrenceCount).toBe(3);
  });

  it('throttles drift alerts per dedupe key', () => {
    const key = 'BASEBALL:displayClock:401';
    recordFieldDlq({ sport: 'BASEBALL', gameId: '401', canonicalField: 'displayClock' });
    expect(shouldEmitDlqAlert(key)).toBe(true);
    expect(shouldEmitDlqAlert(key)).toBe(false);
  });

  it('uses batch key when gameId is absent', () => {
    recordFieldDlq({ sport: 'FOOTBALL', canonicalField: 'awayScore' });
    expect(getDlqEntry('FOOTBALL:awayScore:batch')?.occurrenceCount).toBe(1);
  });
});
