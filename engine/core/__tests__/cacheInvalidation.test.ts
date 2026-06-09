import { beforeEach, describe, expect, it } from 'vitest';
import { cacheBustKey, cacheGet, cacheKey, cacheSetWithProfile, consumeBypassCache, resetCacheForTests } from '../cache';
import { profileForResource } from '../cacheTiers';
import { resetScoreboardSnapshots, syncCacheFromScoreboard } from '../cacheInvalidation';
import { makeGame, makeTeam } from './fixtures';

describe('syncCacheFromScoreboard', () => {
  beforeEach(() => {
    resetScoreboardSnapshots();
    resetCacheForTests();
  });

  it('does not bust on first sight of a game', () => {
    const game = makeGame({
      id: '401',
      away: makeTeam({ name: 'Away', abbr: 'AWY', score: 0 }),
      home: makeTeam({ name: 'Home', abbr: 'HME', score: 0 }),
      statusState: 'in',
    });

    const busted = syncCacheFromScoreboard([game], {
      resolveSummaryKey: (g) => cacheKey('summary', g.id),
    });

    expect(busted).toEqual([]);
  });

  it('busts summary cache when live scores change', () => {
    const summaryKey = cacheKey('summary', '401');
    cacheSetWithProfile(summaryKey, { ok: true }, profileForResource('summary', 'in'), [`game:401`]);

    const base = {
      id: '401',
      away: makeTeam({ name: 'Away', abbr: 'AWY', score: 10 }),
      home: makeTeam({ name: 'Home', abbr: 'HME', score: 8 }),
      statusState: 'in' as const,
    };

    syncCacheFromScoreboard([makeGame(base)], { resolveSummaryKey: () => summaryKey });

    const updated = makeGame({ ...base, away: { ...base.away, score: 12 } });
    const busted = syncCacheFromScoreboard([updated], { resolveSummaryKey: () => summaryKey });

    expect(busted).toEqual(['401']);
    expect(cacheGet(summaryKey)).toBeUndefined();
    expect(consumeBypassCache(summaryKey)).toBe(true);
  });

  it('busts team tags when a game finishes', () => {
    const teamKey = cacheKey('team-roster', 'LAL');
    cacheSetWithProfile(teamKey, ['player'], profileForResource('roster'), ['team:LAL']);

    const live = makeGame({
      id: '402',
      away: makeTeam({ name: 'Lakers', abbr: 'LAL', score: 100 }),
      home: makeTeam({ name: 'Celtics', abbr: 'BOS', score: 98 }),
      statusState: 'in',
    });
    syncCacheFromScoreboard([live], {});

    const final = makeGame({
      ...live,
      statusState: 'post',
      status: 'Final',
    });
    syncCacheFromScoreboard([final], {});

    expect(cacheGet(teamKey)).toBeUndefined();
  });

  it('does not bust pre-game scoreboard noise', () => {
    const summaryKey = cacheKey('summary', '403');
    cacheSetWithProfile(summaryKey, { ok: true }, profileForResource('summary', 'pre'), [`game:403`]);

    const pre = makeGame({
      id: '403',
      away: makeTeam({ name: 'A', abbr: 'A', score: 0 }),
      home: makeTeam({ name: 'B', abbr: 'B', score: 0 }),
      statusState: 'pre',
    });
    syncCacheFromScoreboard([pre], { resolveSummaryKey: () => summaryKey });

    const pre2 = makeGame({ ...pre, clock: '7:00 PM ET' });
    const busted = syncCacheFromScoreboard([pre2], { resolveSummaryKey: () => summaryKey });

    expect(busted).toEqual([]);
    expect(cacheGet(summaryKey)).toEqual({ ok: true });
  });

  it('cleans up snapshots for games no longer on the scoreboard', () => {
    const game = makeGame({
      id: '404',
      away: makeTeam({ name: 'X', abbr: 'X', score: 1 }),
      home: makeTeam({ name: 'Y', abbr: 'Y', score: 0 }),
      statusState: 'in',
    });
    syncCacheFromScoreboard([game], {});

    syncCacheFromScoreboard([], {});

    const again = makeGame({ ...game, away: { ...game.away, score: 2 } });
    const busted = syncCacheFromScoreboard([again], {});
    expect(busted).toEqual([]);
  });
});

describe('cacheBustKey', () => {
  beforeEach(() => resetCacheForTests());

  it('forces bypass on next read', () => {
    const key = cacheKey('test', 'bypass');
    cacheBustKey(key);
    expect(consumeBypassCache(key)).toBe(true);
    expect(consumeBypassCache(key)).toBe(false);
  });
});
