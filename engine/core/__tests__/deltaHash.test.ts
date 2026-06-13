import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as parseModule from '../../../services/parsers/parseGameEvent';
import { loadGoldenFixture } from '../../adjuster/fixtureTestUtils';
import {
  getHashGateStats,
  hashEvent,
  hashRaw,
  parseEventsWithHashGate,
  requestBypassHashGate,
  resetDeltaHashCache,
} from '../deltaHash';

describe('deltaHash', () => {
  beforeEach(() => {
    resetDeltaHashCache();
  });

  it('hashRaw is stable for identical input', () => {
    const json = JSON.stringify({ id: '401', score: 10 });
    expect(hashRaw(json)).toBe(hashRaw(json));
  });

  it('hashEvent changes when score changes', () => {
    const a = { id: '401', competitions: [{ competitors: [{ score: '10' }] }] };
    const b = { id: '401', competitions: [{ competitors: [{ score: '11' }] }] };
    expect(hashEvent(a).hash).not.toBe(hashEvent(b).hash);
  });

  it('identical raw JSON skips parser on subsequent polls', () => {
    const fixture = loadGoldenFixture('basketball/live-standard.json');
    const events = [fixture];
    const parseSpy = vi.spyOn(parseModule, 'parseEventsForSport');

    parseEventsWithHashGate(events, 'BASKETBALL');
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(getHashGateStats().misses).toBe(1);

    parseEventsWithHashGate(events, 'BASKETBALL');
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(getHashGateStats().hits).toBe(1);
  });

  it('score change in raw JSON triggers re-parse', () => {
    const fixture = loadGoldenFixture('basketball/live-standard.json');
    const events = [fixture];
    const mutated = structuredClone(fixture) as Record<string, unknown>;
    const comp = (mutated.competitions as { competitors: { score: string }[] }[])[0];
    comp.competitors[0]!.score = '99';

    const parseSpy = vi.spyOn(parseModule, 'parseEventsForSport');

    parseEventsWithHashGate(events, 'BASKETBALL');
    parseEventsWithHashGate([mutated], 'BASKETBALL');

    expect(parseSpy).toHaveBeenCalledTimes(2);
    expect(getHashGateStats().hits).toBe(0);
    expect(getHashGateStats().misses).toBe(2);
  });

  it('100 identical payloads produce 99 hash gate hits', () => {
    const fixture = loadGoldenFixture('basketball/live-standard.json');
    const events = [fixture];
    vi.spyOn(parseModule, 'parseEventsForSport');

    parseEventsWithHashGate(events, 'BASKETBALL');
    for (let i = 0; i < 99; i++) {
      parseEventsWithHashGate(events, 'BASKETBALL');
    }

    expect(getHashGateStats().hits).toBe(99);
    expect(getHashGateStats().misses).toBe(1);
  });

  it('requestBypassHashGate forces re-parse even when hash matches', () => {
    const fixture = loadGoldenFixture('basketball/live-standard.json');
    const events = [fixture];
    const parseSpy = vi.spyOn(parseModule, 'parseEventsForSport');

    parseEventsWithHashGate(events, 'BASKETBALL');
    requestBypassHashGate();
    parseEventsWithHashGate(events, 'BASKETBALL');

    expect(parseSpy).toHaveBeenCalledTimes(2);
  });

  it('evicts oldest entry when LRU cap exceeded', () => {
    for (let i = 0; i < 201; i++) {
      const event = {
        id: String(1000 + i),
        competitions: [{ competitors: [{ homeAway: 'home', team: { displayName: 'A' }, score: '0' }, { homeAway: 'away', team: { displayName: 'B' }, score: '0' }] }],
        status: { type: { state: 'in' } },
      };
      parseEventsWithHashGate([event], 'BASKETBALL');
    }

    expect(getHashGateStats().entries).toBe(200);
  });
});
