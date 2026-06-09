import { describe, expect, it } from 'vitest';
import {
  aggregateSherdogFights,
  parseMappedCsv,
  sportsReferenceSlug,
  splitCsvLine,
} from '../historicalSources';

describe('sportsReferenceSlug', () => {
  it('uses ESPN id when already in reference format', () => {
    expect(sportsReferenceSlug('jamesle01', 'LeBron James')).toBe('jamesle01');
    expect(sportsReferenceSlug('BradyTo00', 'Tom Brady', true)).toBe('BradyTo00');
  });

  it('builds slug from player name', () => {
    expect(sportsReferenceSlug('12345', 'LeBron James')).toBe('jamesle01');
    expect(sportsReferenceSlug('12345', 'Tom Brady', true)).toBe('BradyTo00');
  });

  it('returns null for single-name players', () => {
    expect(sportsReferenceSlug('12345', 'Madonna')).toBeNull();
  });
});

describe('splitCsvLine', () => {
  it('handles quoted commas', () => {
    expect(splitCsvLine('2024,"LAL, Two",82,25.0')).toEqual(['2024', 'LAL, Two', '82', '25.0']);
  });
});

describe('parseMappedCsv', () => {
  it('maps season rows and skips career totals', () => {
    const csv = [
      'Season,Team,A,B,C,D,G,MP,PTS',
      '2023-24,LAL,1,2,3,4,82,35.0,25.0',
      'Career,,1,2,3,4,900,30.0,27.0',
    ].join('\n');

    const rows = parseMappedCsv(csv, { gp: 6, min: 7, pts: 8 });
    expect(rows).toEqual([
      expect.objectContaining({ season: '2023-24', team: 'LAL', gp: '82', min: '35.0', pts: '25.0' }),
    ]);
  });
});

describe('aggregateSherdogFights', () => {
  it('aggregates yearly fight records from fighter HTML', () => {
    const html = `
      <tr><td>Jan 1, 2024</td><td>win</td></tr>
      <tr><td>Mar 2, 2024</td><td>loss</td></tr>
      <tr><td>Jun 3, 2023</td><td>win</td></tr>
    `;

    const rows = aggregateSherdogFights(html);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ season: '2024', gp: '2', pts: '1', reb: '1' });
    expect(rows[1]).toMatchObject({ season: '2023', gp: '1', pts: '1', reb: '0' });
  });
});
