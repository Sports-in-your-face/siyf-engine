import { describe, expect, it } from 'vitest';
import { extractSoccerLeagueSlug } from '../../../services/parsers/parseSoccerContext';

describe('extractSoccerLeagueSlug', () => {
  it('prefers event.leagues[0].slug', () => {
    expect(extractSoccerLeagueSlug({
      leagues: [{ slug: 'uefa.champions', name: 'UCL' }],
    })).toBe('uefa.champions');
  });

  it('falls back to competition.league.slug', () => {
    expect(extractSoccerLeagueSlug(
      { leagues: [] },
      { league: { slug: 'esp.1' } },
    )).toBe('esp.1');
  });

  it('falls back to event.league.slug', () => {
    expect(extractSoccerLeagueSlug({
      league: { slug: 'ger.1' },
    })).toBe('ger.1');
  });

  it('defaults to Premier League slug', () => {
    expect(extractSoccerLeagueSlug({})).toBe('eng.1');
  });
});

describe('multi-league slug disambiguation', () => {
  it('distinguishes domestic vs European competition on same matchday', () => {
    const epl = extractSoccerLeagueSlug({ leagues: [{ slug: 'eng.1' }] });
    const ucl = extractSoccerLeagueSlug({ leagues: [{ slug: 'uefa.champions' }] });
    expect(epl).not.toBe(ucl);
  });
});
