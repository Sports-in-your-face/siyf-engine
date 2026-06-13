import { describe, it, expect } from 'vitest';
import { flattenEspnRosterEntries, parseEspnRosterEntries } from '../espnRosterUtils';

describe('espnRosterUtils', () => {
  it('flattens position-grouped roster items', () => {
    const data = {
      athletes: [
        {
          position: 'offense',
          items: [
            { id: '1', displayName: 'Player One', position: { abbreviation: 'QB' }, jersey: '1' },
            { id: '2', displayName: 'Player Two', position: { abbreviation: 'RB' }, jersey: '2' },
          ],
        },
        {
          position: 'defense',
          items: [{ id: '3', displayName: 'Player Three', position: { abbreviation: 'DE' }, jersey: '3' }],
        },
      ],
    };
    const parsed = parseEspnRosterEntries(data);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((p) => p.name)).toEqual(['Player One', 'Player Two', 'Player Three']);
  });

  it('handles flat athlete list with nested athlete objects', () => {
    const data = {
      athletes: [
        { athlete: { id: '10', displayName: 'Nested Player', position: { abbreviation: 'PG' } } },
      ],
    };
    expect(flattenEspnRosterEntries(data)).toHaveLength(1);
    expect(parseEspnRosterEntries(data)[0].name).toBe('Nested Player');
  });

  it('handles team.athletes fallback', () => {
    const data = {
      team: {
        athletes: [{ id: '99', displayName: 'Direct Player', position: { abbreviation: 'C' } }],
      },
    };
    expect(parseEspnRosterEntries(data)[0].id).toBe('99');
  });
});
