import { describe, expect, it } from 'vitest';
import { flattenEspnRosterAthletes, parseEspnRosterResponse } from '../espnRoster';

describe('espnRoster', () => {
  it('flattens position-grouped roster payloads', () => {
    const data = {
      athletes: [
        {
          position: 'Guards',
          items: [
            { id: '1', displayName: 'Player One', jersey: '1', position: { abbreviation: 'PG' } },
            { id: '2', displayName: 'Player Two', jersey: '2', position: { abbreviation: 'SG' } },
          ],
        },
        {
          position: 'Forwards',
          items: [
            { id: '3', displayName: 'Player Three', jersey: '23', position: { abbreviation: 'SF' } },
          ],
        },
      ],
    };

    const roster = parseEspnRosterResponse(data);
    expect(roster).toHaveLength(3);
    expect(roster.map((p) => p.name)).toEqual(['Player One', 'Player Two', 'Player Three']);
    expect(flattenEspnRosterAthletes(data)).toHaveLength(3);
  });

  it('still supports flat athlete arrays', () => {
    const data = {
      athletes: [
        { athlete: { id: '9', displayName: 'Flat Player', jersey: '9', position: { abbreviation: 'C' } } },
      ],
    };
    expect(parseEspnRosterResponse(data)).toHaveLength(1);
  });
});
