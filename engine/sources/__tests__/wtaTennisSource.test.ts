import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCacheForTests } from '../../core/cache';
import { resetResilientFetchBackoff } from '../../core/resilientFetch';
import {
  buildWtaHeadshotUrl,
  buildWtaPlayerProfileUrl,
  enrichWtaTennisHeadshots,
  slugifyWtaPlayerName,
} from '../wtaTennisSource';
import { makeGame, makeTeam } from '../../core/__tests__/fixtures';

vi.mock('../../core/resilientFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/resilientFetch')>();
  return {
    ...actual,
    fetchJsonResilient: vi.fn(),
  };
});

import { fetchJsonResilient } from '../../core/resilientFetch';

const mockFetch = vi.mocked(fetchJsonResilient);

describe('wtaTennisSource helpers', () => {
  it('slugifyWtaPlayerName normalizes accents and spaces', () => {
    expect(slugifyWtaPlayerName('Kayla Day')).toBe('kayla-day');
    expect(slugifyWtaPlayerName('Naomi Ōsaka')).toBe('naomi-osaka');
  });

  it('buildWtaPlayerProfileUrl uses slugified name', () => {
    expect(buildWtaPlayerProfileUrl(322534, 'Kayla Day')).toBe(
      'https://www.wtatennis.com/players/322534/kayla-day',
    );
  });

  it('buildWtaHeadshotUrl points at WTA CDN', () => {
    expect(buildWtaHeadshotUrl(322534)).toBe(
      'https://wtafiles.blob.core.windows.net/images/headshots/322534.jpg',
    );
  });
});

describe('enrichWtaTennisHeadshots', () => {
  beforeEach(() => {
    resetCacheForTests();
    resetResilientFetchBackoff();
    mockFetch.mockReset();
  });

  it('dedupes player lookups across games', async () => {
    mockFetch
      .mockResolvedValueOnce({ content: [{ id: 100, fullName: 'Iga Swiatek' }], pageInfo: { numEntries: 1 } })
      .mockResolvedValueOnce({ content: [{ id: 101, fullName: 'Coco Gauff' }], pageInfo: { numEntries: 1 } })
      .mockResolvedValueOnce({ content: [{ id: 102, fullName: 'Jessica Pegula' }], pageInfo: { numEntries: 1 } });

    const games = [
      makeGame({
        id: 't1',
        sport: 'WTA',
        away: makeTeam({
          name: 'Iga Swiatek',
          abbr: 'SWI',
          logo: 'https://a.espncdn.com/i/teamlogos/countries/500/pol.png',
        }),
        home: makeTeam({
          name: 'Coco Gauff',
          abbr: 'GAU',
          logo: 'https://a.espncdn.com/i/teamlogos/countries/500/usa.png',
        }),
      }),
      makeGame({
        id: 't2',
        sport: 'WTA',
        away: makeTeam({
          name: 'Iga Swiatek',
          abbr: 'SWI',
          logo: 'https://a.espncdn.com/i/teamlogos/countries/500/pol.png',
        }),
        home: makeTeam({
          name: 'Jessica Pegula',
          abbr: 'PEG',
          logo: 'https://a.espncdn.com/i/teamlogos/countries/500/usa.png',
        }),
      }),
    ];

    const enriched = await enrichWtaTennisHeadshots(games);

    expect(enriched[0].away.logo).toBe(buildWtaHeadshotUrl(100));
    expect(enriched[1].away.logo).toBe(buildWtaHeadshotUrl(100));
    expect(mockFetch.mock.calls.filter((c) => String(c[0]).includes('Iga'))).toHaveLength(1);
  });

  it('leaves teams unchanged when lookup fails transiently', async () => {
    const game = makeGame({
      id: 't3',
      sport: 'WTA',
      away: makeTeam({
        name: 'Mayar Sherif',
        abbr: 'SHE',
        logo: 'https://a.espncdn.com/i/teamlogos/countries/500/egy.png',
      }),
      home: makeTeam({
        name: 'Opponent',
        abbr: 'OPP',
        logo: 'https://a.espncdn.com/i/teamlogos/countries/500/usa.png',
      }),
    });

    mockFetch
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({ content: [{ id: 200, fullName: 'Opponent' }], pageInfo: { numEntries: 1 } });

    const enriched = await enrichWtaTennisHeadshots([game]);
    expect(enriched[0].away.logo).toBe('https://a.espncdn.com/i/teamlogos/countries/500/egy.png');
  });

  it('skips non-WTA games', async () => {
    const game = makeGame({
      id: 't4',
      sport: 'ATP',
      away: makeTeam({ name: 'Novak Djokovic', abbr: 'DJO' }),
      home: makeTeam({ name: 'Carlos Alcaraz', abbr: 'ALC' }),
    });

    const enriched = await enrichWtaTennisHeadshots([game]);
    expect(enriched).toEqual([game]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
