import { describe, expect, it, beforeEach } from 'vitest';
import { resetParseTelemetry } from '../../../engine/adjuster/telemetry';
import { parseEventsForSport } from '../parseGameEvent';

describe('parseEventsForSport', () => {
  beforeEach(() => {
    resetParseTelemetry();
  });
  it('parses a team sport event with home/away competitors', () => {
    const games = parseEventsForSport([
      {
        id: '401234',
        status: { type: { state: 'in', shortDetail: 'Q2' }, displayClock: '5:32' },
        competitions: [{
          competitors: [
            {
              homeAway: 'away',
              score: '52',
              team: { displayName: 'Lakers', abbreviation: 'LAL' },
            },
            {
              homeAway: 'home',
              score: '48',
              team: { displayName: 'Celtics', abbreviation: 'BOS' },
            },
          ],
        }],
      },
    ], 'BASKETBALL');

    expect(games).toHaveLength(1);
    expect(games[0].id).toBe('401234');
    expect(games[0].away.abbr).toBe('LAL');
    expect(games[0].home.abbr).toBe('BOS');
    expect(games[0].statusState).toBe('in');
  });

  it('skips entries without a valid event id', () => {
    const games = parseEventsForSport([{ competitions: [] }, null, {}], 'BASKETBALL');
    expect(games).toEqual([]);
  });

  it('detects WNBA from team names when league metadata is missing', () => {
    const games = parseEventsForSport([
      {
        id: '402000',
        status: { type: { state: 'pre', shortDetail: 'Scheduled' } },
        competitions: [{
          competitors: [
            {
              homeAway: 'away',
              score: '0',
              team: { displayName: 'Atlanta Dream', abbreviation: 'ATL' },
            },
            {
              homeAway: 'home',
              score: '0',
              team: { displayName: 'Chicago Sky', abbreviation: 'CHI' },
            },
          ],
        }],
      },
    ], 'BASKETBALL');

    expect(games[0].sport).toBe('WNBA');
  });

  it('tags WNBA events and coerces object scores', () => {
    const games = parseEventsForSport([
      {
        id: '401999',
        leagues: [{ abbreviation: 'WNBA' }],
        status: { type: { state: 'pre', shortDetail: 'Scheduled' } },
        competitions: [{
          competitors: [
            {
              homeAway: 'away',
              score: { displayValue: '0' },
              team: { id: 20, displayName: 'Atlanta Dream', abbreviation: 'ATL' },
            },
            {
              homeAway: 'home',
              score: { displayValue: '0' },
              team: { id: 19, displayName: 'Chicago Sky', abbreviation: 'CHI' },
            },
          ],
        }],
      },
    ], 'BASKETBALL');

    expect(games).toHaveLength(1);
    expect(games[0].sport).toBe('WNBA');
    expect(games[0].away.name).toBe('Atlanta Dream');
    expect(games[0].away.score).toBe(0);
    expect(games[0].home.name).toBe('Chicago Sky');
  });
});
