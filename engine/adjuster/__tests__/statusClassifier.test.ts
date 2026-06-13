import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Game } from '../../../types';
import * as siyfCdn from '../../../config/siyfCdn';
import {
  classifyStatusSignal,
  hasActiveClock,
  loadCdnPauseKeywordsOverlay,
  resetCdnPauseKeywordsOverlay,
} from '../statusClassifier';

function game(partial: Partial<Game> & Pick<Game, 'id'>): Game {
  return {
    home: { name: 'Home', abbr: 'HOM', score: 0 },
    away: { name: 'Away', abbr: 'AWY', score: 0 },
    status: 'Live',
    clock: '—',
    ...partial,
  };
}

describe('statusClassifier', () => {
  it('detects running MM:SS clock', () => {
    expect(hasActiveClock(game({ id: '1', clock: '4:32' }))).toBe(true);
    expect(hasActiveClock(game({ id: '2', clock: '12:00' }))).toBe(true);
  });

  it('rejects possession-style labels as active clock', () => {
    expect(hasActiveClock(game({ id: '3', clock: '—', status: 'Time of Possession 8:42' }))).toBe(false);
  });

  it('classifies rain delay as paused', () => {
    const g = game({ id: '4', statusState: 'in', status: 'Rain Delay', clock: '—' });
    expect(classifyStatusSignal(g)).toBe('paused');
  });

  it('classifies halftime as break', () => {
    const g = game({ id: '5', statusState: 'in', status: 'Halftime', clock: 'Halftime' });
    expect(classifyStatusSignal(g)).toBe('break');
  });

  it('classifies active in-game as live', () => {
    const g = game({ id: '6', statusState: 'in', status: 'Q3', clock: '4:32' });
    expect(classifyStatusSignal(g)).toBe('live');
  });

  it('classifies pre and post', () => {
    expect(classifyStatusSignal(game({ id: '7', statusState: 'pre' }))).toBe('scheduled');
    expect(classifyStatusSignal(game({ id: '8', statusState: 'post', status: 'Final' }))).toBe('final');
  });

  it('merges CDN pause keywords', async () => {
    vi.spyOn(siyfCdn, 'fetchCdnPauseKeywords').mockResolvedValue({
      version: 1,
      global: ['fog delay'],
      sports: {},
    });
    await loadCdnPauseKeywordsOverlay();
    const g = game({ id: '9', statusState: 'in', status: 'Fog Delay', clock: '—' });
    expect(classifyStatusSignal(g)).toBe('paused');
  });
});

afterEach(() => {
  resetCdnPauseKeywordsOverlay();
  vi.restoreAllMocks();
});
