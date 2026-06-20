import { describe, expect, it } from 'vitest';
import {
  buildSoccerSummaryFallbackLeagues,
  isEspnNumericEventId,
  isYahooSourcedGame,
} from '../soccerDetailResolver';
import type { Game } from '../../../types';

const baseGame: Game = {
  id: '401815802',
  sport: 'SOCCER',
  status: 'Scheduled',
  statusState: 'pre',
  clock: '',
  away: { name: 'Away', abbr: 'AWY', score: 0 },
  home: { name: 'Home', abbr: 'HME', score: 0 },
  leagueSlug: 'eng.1',
};

describe('soccerDetailResolver', () => {
  it('detects Yahoo-sourced game ids', () => {
    expect(isYahooSourcedGame('yahoo-soccer.g.13587239')).toBe(true);
    expect(isYahooSourcedGame('401815802')).toBe(false);
  });

  it('accepts only numeric ESPN event ids', () => {
    expect(isEspnNumericEventId('401815802')).toBe(true);
    expect(isEspnNumericEventId('yahoo-soccer.g.1')).toBe(false);
  });

  it('caps soccer summary league fallbacks', () => {
    const fallbacks = buildSoccerSummaryFallbackLeagues('eng.1', baseGame);
    expect(fallbacks.length).toBeLessThanOrEqual(5);
  });

  it('prioritizes international slugs for world cup hints', () => {
    const fallbacks = buildSoccerSummaryFallbackLeagues('usa.1', {
      ...baseGame,
      leagueSlug: 'usa.1',
      subtitle: 'World Cup',
    });
    expect(fallbacks[0]).toBe('fifa.world');
  });
});
