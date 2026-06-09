import { describe, expect, it } from 'vitest';
import { parseEspnGameMeta, parseEspnTopPerformers } from '../../sources/espnSource';
import { parseEspnGolfGameMeta, parseEspnGolfTeamStats, parseEspnGolfTopPerformers } from '../../sources/espnGolfSource';
import { parseEspnMmaGameMeta, parseEspnMmaTopPerformers } from '../../sources/espnMmaSource';
import { parseEspnTennisGameMeta, parseEspnTennisTeamStats, parseEspnTennisTopPerformers } from '../../sources/espnTennisSource';

describe('parseEspnGameMeta (basketball)', () => {
  it('reads venue and broadcast from header competitions', () => {
    const meta = parseEspnGameMeta({
      header: {
        competitions: [{
          venue: { fullName: 'Crypto.com Arena' },
          broadcasts: [{ names: ['ESPN', 'ABC'] }],
          attendance: 18997,
        }],
      },
    });

    expect(meta.venue).toBe('Crypto.com Arena');
    expect(meta.broadcast).toBe('ESPN, ABC');
    expect(meta.attendance).toBe('18997');
  });
});

describe('parseEspnTopPerformers (basketball)', () => {
  it('extracts top scorers from boxscore blocks', () => {
    const performers = parseEspnTopPerformers({
      boxscore: {
        players: [{
          team: { abbreviation: 'LAL' },
          statistics: [{
            labels: ['PTS', 'REB', 'AST'],
            athletes: [{
              athlete: {
                id: '2544',
                displayName: 'LeBron James',
                position: { abbreviation: 'F' },
                headshot: { href: 'https://example.com/lebron.png' },
              },
              stats: ['28', '8', '9'],
            }],
          }],
        }],
      },
    });

    expect(performers).toHaveLength(1);
    expect(performers[0].name).toBe('LeBron James');
    expect(performers[0].team).toBe('LAL');
    expect(performers[0].stats.find((s) => s.label === 'PTS')?.value).toBe('28');
  });
});

describe('parseEspnTennis parsers', () => {
  const tennisSummary = {
    competition: {
      venue: { fullName: 'Indian Wells' },
      broadcasts: [{ names: ['Tennis Channel'] }],
      competitors: [
        {
          id: 'a1',
          order: 1,
          athlete: { id: '100', displayName: 'Iga Swiatek' },
          statistics: [{ abbreviation: 'ACE', displayValue: '5' }],
        },
        {
          id: 'a2',
          order: 2,
          athlete: { id: '101', displayName: 'Coco Gauff' },
          statistics: [{ abbreviation: 'ACE', displayValue: '3' }],
        },
      ],
    },
  };

  it('parseEspnTennisGameMeta reads venue', () => {
    expect(parseEspnTennisGameMeta(tennisSummary).venue).toBe('Indian Wells');
  });

  it('parseEspnTennisTeamStats maps competitor statistics', () => {
    const stats = parseEspnTennisTeamStats(tennisSummary);
    expect(stats?.away[0]).toEqual({ label: 'ACE', value: '5' });
    expect(stats?.home[0]).toEqual({ label: 'ACE', value: '3' });
  });

  it('parseEspnTennisTopPerformers returns both competitors', () => {
    const performers = parseEspnTennisTopPerformers(tennisSummary);
    expect(performers.map((p) => p.name)).toEqual(['Iga Swiatek', 'Coco Gauff']);
  });
});

describe('parseEspnGolf parsers', () => {
  const golfSummary = {
    header: {
      venue: { fullName: 'Augusta National' },
      broadcasts: [{ names: ['CBS'] }],
      purse: 18_000_000,
      courses: [{ par: 72, yardage: 7475 }],
      competitions: [{
        competitors: [
          {
            order: 1,
            athlete: { id: 'g1', displayName: 'Scottie Scheffler', citizenship: 'USA' },
            score: '-12',
            linescores: ['68', '69', '67', '68'],
          },
        ],
      }],
    },
  };

  it('parseEspnGolfGameMeta reads course venue', () => {
    expect(parseEspnGolfGameMeta(golfSummary).venue).toBe('Augusta National');
  });

  it('parseEspnGolfTeamStats includes tournament and leader rows', () => {
    const stats = parseEspnGolfTeamStats(golfSummary);
    expect(stats?.home.some((s) => s.label === 'Par')).toBe(true);
    expect(stats?.away.some((s) => s.label === 'Leader' && s.value === 'Scottie Scheffler')).toBe(true);
  });

  it('parseEspnGolfTopPerformers sorts by order', () => {
    const performers = parseEspnGolfTopPerformers(golfSummary);
    expect(performers[0].name).toBe('Scottie Scheffler');
    expect(performers[0].stats.some((s) => s.label === 'TO PAR')).toBe(true);
  });
});

describe('parseEspnMma parsers', () => {
  const mmaSummary = {
    events: [{
      venue: { fullName: 'T-Mobile Arena' },
      broadcasts: [{ names: ['ESPN+ PPV'] }],
      competitions: [{
        competitors: [
          { athlete: { id: 'f1', displayName: 'Fighter A' }, winner: true, statistics: [{ abbreviation: 'SIG', displayValue: '45' }] },
          { athlete: { id: 'f2', displayName: 'Fighter B' }, winner: false, statistics: [{ abbreviation: 'SIG', displayValue: '32' }] },
        ],
      }],
    }],
  };

  it('parseEspnMmaGameMeta reads UFC venue', () => {
    expect(parseEspnMmaGameMeta(mmaSummary).venue).toBe('T-Mobile Arena');
  });

  it('parseEspnMmaTopPerformers lists both fighters', () => {
    const performers = parseEspnMmaTopPerformers(mmaSummary);
    expect(performers.map((p) => p.name)).toEqual(['Fighter A', 'Fighter B']);
    expect(performers[0].position).toBe('Winner');
  });
});
