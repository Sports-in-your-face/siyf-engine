import { describe, expect, it } from 'vitest';
import {
  extractEspnLeagueSlug,
  findEspnEventById,
  getEspnEvents,
} from '../espnEventTypes';

describe('espnEventTypes', () => {
  it('extracts events from scoreboard payloads', () => {
    const events = getEspnEvents({ events: [{ id: '401', leagues: [{ slug: 'eng.1' }] }] });
    expect(events).toHaveLength(1);
    expect(findEspnEventById(events, '401')?.leagues?.[0]?.slug).toBe('eng.1');
  });

  it('resolves league slug with fallbacks', () => {
    const event = { leagues: [{ slug: 'esp.1' }] };
    expect(extractEspnLeagueSlug(event, undefined, 'eng.1')).toBe('esp.1');
    expect(extractEspnLeagueSlug(undefined, { league: { slug: 'ger.1' } }, 'eng.1')).toBe('ger.1');
    expect(extractEspnLeagueSlug(undefined, undefined, 'eng.1')).toBe('eng.1');
  });
});
