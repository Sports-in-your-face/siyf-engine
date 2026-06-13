import { describe, expect, it, beforeEach } from 'vitest';
import { sniffField, CLOCK_RULE } from '../valueSniffer';

describe('valueSniffer', () => {
  it('finds displayClock with time-related key', () => {
    const raw = {
      status: { displayClock: '4:32', type: { shortDetail: 'Q3' } },
    };
    const { value, candidate } = sniffField(raw, CLOCK_RULE);
    expect(value).toBe('4:32');
    expect(candidate?.key).toBe('displayClock');
  });

  it('ignores possession timer with MM:SS value', () => {
    const raw = {
      statistics: { timeOfPossession: '8:42' },
      status: { displayClock: '4:32' },
    };
    const { value, candidate } = sniffField(raw, CLOCK_RULE);
    expect(value).toBe('4:32');
    expect(candidate?.key).not.toBe('timeOfPossession');
  });

  it('ignores MM:SS values on rejected keys', () => {
    const raw = {
      penalties: { timeRemainingInPenalty: '2:00' },
    };
    const { value } = sniffField(raw, CLOCK_RULE);
    expect(value).toBeUndefined();
  });
});
