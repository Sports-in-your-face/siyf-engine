import { describe, expect, it } from 'vitest';
import {
  filterHeadlinesForLeague,
  isGenericHeadline,
  isRelevantHeadline,
} from '../headlineFeeds';

describe('headlineFeeds', () => {
  it('drops generic listicles for NBA', () => {
    expect(isGenericHeadline('NBA', 'NBA Power Rankings: Week 12')).toBe(true);
    expect(isGenericHeadline('NBA', 'Lakers beat Celtics in overtime thriller')).toBe(false);
  });

  it('keeps MLS headlines and drops European soccer on MLS page', () => {
    expect(isRelevantHeadline('MLS', 'Inter Miami sign striker from Argentina')).toBe(true);
    expect(isRelevantHeadline('MLS', 'Arsenal beat Chelsea in Premier League clash')).toBe(false);
    expect(isRelevantHeadline('MLS', 'Real Madrid advance in Champions League')).toBe(false);
  });

  it('dedupes and filters headline items', () => {
    const items = [
      { title: 'Lakers edge Suns in Game 5', pubDate: 'Mon, 01 Jan 2024 12:00:00 GMT' },
      { title: 'Lakers edge Suns in Game 5', pubDate: 'Mon, 01 Jan 2024 11:00:00 GMT' },
      { title: 'NBA Power Rankings: January', pubDate: 'Mon, 01 Jan 2024 10:00:00 GMT' },
      { title: 'Short', pubDate: 'Mon, 01 Jan 2024 09:00:00 GMT' },
    ];
    const out = filterHeadlinesForLeague('NBA', items);
    expect(out).toHaveLength(1);
    expect(out[0].title).toContain('Lakers');
  });
});
