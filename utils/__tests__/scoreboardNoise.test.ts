import { describe, expect, it } from 'vitest';
import { displaySubtitle } from '../gameDisplay';
import { getSeriesSummary, contextBadge } from '../gameMeta';
import { isScoreboardNoiseText, contextLabelFromHeadline } from '../scoreboardNoise';
import type { Game } from '../../types';

describe('scoreboardNoise', () => {
  it('flags article-style watch guides', () => {
    const text = 'Where to watch New York Mets vs. Cincinnati Reds: Live stream, start time, TV channel, odds for Wednesday, June 17';
    expect(isScoreboardNoiseText(text)).toBe(true);
  });

  it('allows short playoff round labels', () => {
    expect(isScoreboardNoiseText('ALCS Game 3')).toBe(false);
    expect(isScoreboardNoiseText('Stanley Cup Final · Game 4')).toBe(false);
    expect(isScoreboardNoiseText('AFC Championship Game')).toBe(false);
    expect(isScoreboardNoiseText('NBA Finals · Game 5')).toBe(false);
    expect(isScoreboardNoiseText('The Masters · Round 4')).toBe(false);
    expect(isScoreboardNoiseText('Wimbledon · Final')).toBe(false);
    expect(isScoreboardNoiseText('UFC 300 · Lightweight')).toBe(false);
  });

  it('builds safe badge labels from headlines', () => {
    expect(contextLabelFromHeadline('NBA Finals - Game 5')).toBe('NBA FINALS · GAME 5');
    expect(contextLabelFromHeadline('Where to watch Lakers vs Celtics live')).toBeUndefined();
  });
});

describe('displaySubtitle', () => {
  it('drops RSS watch-guide subtitles', () => {
    const game = {
      id: '1',
      away: { name: 'NYM', abbr: 'NYM', score: 0 },
      home: { name: 'CIN', abbr: 'CIN', score: 0 },
      status: 'Top 7th',
      clock: '',
      subtitle: 'Where to watch Mets vs Reds: Live stream, TV channel',
    } as Game;
    expect(displaySubtitle(game)).toBeUndefined();
  });
});

describe('gameMeta', () => {
  it('drops noisy series summaries', () => {
    const game = {
      id: '1',
      away: { name: 'A', abbr: 'A', score: 0 },
      home: { name: 'B', abbr: 'B', score: 0 },
      status: 'Final',
      clock: '',
      context: {
        phase: 'regular',
        priority: 0,
        seriesSummary: 'Where to watch Yankees vs Red Sox tonight on ESPN',
      },
    } as Game;
    expect(getSeriesSummary(game)).toBeUndefined();
  });

  it('drops noisy context badges', () => {
    const game = {
      id: '1',
      away: { name: 'A', abbr: 'A', score: 0 },
      home: { name: 'B', abbr: 'B', score: 0 },
      status: 'Live',
      clock: '',
      context: {
        phase: 'regular',
        priority: 0,
        badge: 'WHERE TO WATCH METS VS REDS LIVE STREAM START TIME',
      },
    } as Game;
    expect(contextBadge(game)).toBeUndefined();
  });
});
