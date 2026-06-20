import { describe, expect, it } from 'vitest';
import { getPlayerProfileForLeague, getSportProfile } from '../sportProfiles';

describe('getPlayerProfileForLeague', () => {
  it('returns NBA profile for basketball tab without league tag', () => {
    const profile = getPlayerProfileForLeague('BASKETBALL');
    expect(profile.athletePath).toBe('basketball/nba');
    expect(profile.heroStatLabels[0]).toBe('PTS');
  });

  it('returns WNBA ESPN path and per-game hero labels', () => {
    const profile = getPlayerProfileForLeague('BASKETBALL', 'WNBA');
    expect(profile.athletePath).toBe('basketball/wnba');
    expect(profile.heroStatLabels.slice(0, 3)).toEqual(['PPG', 'RPG', 'APG']);
  });

  it('does not change non-basketball sports', () => {
    const base = getSportProfile('HOCKEY');
    const profile = getPlayerProfileForLeague('HOCKEY', 'WNBA');
    expect(profile.athletePath).toBe(base.athletePath);
  });
});
