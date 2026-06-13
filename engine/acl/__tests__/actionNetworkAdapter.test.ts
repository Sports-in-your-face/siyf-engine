import { describe, expect, it } from 'vitest';
import { loadGoldenFixture } from '../../adjuster/fixtureTestUtils';
import { actionNetworkAdapter, isActionNetworkGame } from '../adapters/actionNetwork';
import { resolveDisplayClock, resolveEventField, resolveStatusState } from '../router';
import type { AnGame } from '../../sources/actionNetworkSource';

describe('actionNetworkAdapter', () => {
  const raw = loadGoldenFixture('action-network/nba-live.json') as { games: AnGame[] };
  const game = raw.games[0];

  it('detects Action Network game shape', () => {
    expect(isActionNetworkGame(game)).toBe(true);
    expect(isActionNetworkGame({ id: '1' })).toBe(false);
  });

  it('resolves status and clock from AN payload', () => {
    expect(actionNetworkAdapter.resolveStatusState(game)).toBe('in');
    expect(actionNetworkAdapter.resolveDisplayClock(game)).toBe('5:32');
    expect(actionNetworkAdapter.resolveEventField(game, 'eventId')).toBe(`an-${game.id}`);
  });

  it('router falls back to AN when ESPN clock is missing', () => {
    const espnEvent = { status: { type: { shortDetail: 'Q2' } } };
    const clock = resolveDisplayClock(espnEvent, undefined, {
      sport: 'BASKETBALL',
      fallbacks: { actionNetwork: game },
    });
    expect(clock).toBe('5:32');
  });

  it('router uses AN as primary when event is AN-shaped', () => {
    expect(resolveStatusState(game)).toBe('in');
    expect(resolveEventField(game, 'statusShortDetail')).toBe('Q2 5:32');
  });
});
