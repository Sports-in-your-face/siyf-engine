import { describe, expect, it } from 'vitest';
import { getSportParseThreshold, SPORT_PARSE_THRESHOLDS } from '../metrics';

describe('sport parse thresholds', () => {
  it('defines thresholds for all engine sports', () => {
    for (const sport of ['BASKETBALL', 'FOOTBALL', 'SOCCER', 'BASEBALL', 'HOCKEY', 'TENNIS', 'GOLF', 'FIGHTS']) {
      expect(SPORT_PARSE_THRESHOLDS[sport]).toBeDefined();
    }
  });

  it('uses lower bar for golf leaderboard layout', () => {
    expect(getSportParseThreshold('GOLF').warnParseRate).toBeLessThan(
      getSportParseThreshold('BASKETBALL').warnParseRate,
    );
    expect(getSportParseThreshold('GOLF').layout).toBe('leaderboard');
  });

  it('falls back for unknown sports', () => {
    expect(getSportParseThreshold('UNKNOWN').warnParseRate).toBe(0.85);
  });
});
