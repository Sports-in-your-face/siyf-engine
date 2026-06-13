/**
 * Live smoke: player search + profile fetch across sports.
 * Run: cross-env SIYF_LIVE_SMOKE=1 npm test -- engine/__tests__/livePlayerSmoke.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  searchPlayersForSport,
  fetchPlayerDetails,
  fetchStandings,
  fetchTeams,
  type SportType,
} from '../../services/api';

const LIVE = process.env.SIYF_LIVE_SMOKE === '1';

const PLAYER_CASES: { sport: SportType; name: string; expectMatch?: boolean }[] = [
  { sport: 'BASKETBALL', name: 'Shai Gilgeous-Alexander' },
  { sport: 'BASKETBALL', name: 'LeBron James' },
  { sport: 'BASKETBALL', name: 'Victor Wembanyama' },
  { sport: 'FOOTBALL', name: 'Josh Allen' },
  { sport: 'FOOTBALL', name: 'Patrick Mahomes' },
  { sport: 'FOOTBALL', name: 'Travis Kelce' },
  { sport: 'BASEBALL', name: 'Shohei Ohtani' },
  { sport: 'BASEBALL', name: 'Aaron Judge' },
  { sport: 'HOCKEY', name: 'Connor McDavid' },
  { sport: 'HOCKEY', name: 'Nathan MacKinnon' },
  { sport: 'SOCCER', name: 'Erling Haaland' },
  { sport: 'SOCCER', name: 'Mohamed Salah' },
  { sport: 'TENNIS', name: 'Novak Djokovic' },
  { sport: 'TENNIS', name: 'Coco Gauff' },
  { sport: 'GOLF', name: 'Scottie Scheffler' },
  { sport: 'FIGHTS', name: 'Kamaru Usman' },
  { sport: 'FIGHTS', name: 'Leon Edwards' },
  { sport: 'FIGHTS', name: 'Alex Pereira' },
  { sport: 'BASKETBALL', name: 'zzzznotarealplayer999', expectMatch: false },
];

describe.skipIf(!LIVE)('live player smoke', () => {
  it('NBA standings load without Torvik crash', async () => {
    const groups = await fetchStandings('BASKETBALL');
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.length).toBeGreaterThan(0);
    const totalRows = groups.reduce((n, g) => n + (g.rows?.length ?? 0), 0);
    expect(totalRows).toBeGreaterThan(10);
  }, 30_000);

  for (const { sport, name, expectMatch = true } of PLAYER_CASES) {
    it(`${sport}: search "${name}"`, async () => {
      const results = await searchPlayersForSport(sport, name);
      expect(Array.isArray(results)).toBe(true);
      if (!expectMatch) {
        expect(results.length).toBe(0);
        return;
      }
      expect(results.length).toBeGreaterThan(0);
      const hit =
        results.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? results[0];
      expect(hit.id).toMatch(/^\d+$/);
      expect(hit.name.length).toBeGreaterThan(1);
    }, 20_000);
  }

  const DETAIL_SAMPLE = PLAYER_CASES.filter((c) => c.expectMatch !== false).slice(0, 10);
  for (const { sport, name } of DETAIL_SAMPLE) {
    it(`${sport}: profile "${name}"`, async () => {
      const results = await searchPlayersForSport(sport, name);
      const hit =
        results.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? results[0];
      expect(hit?.id).toMatch(/^\d+$/);

      const details = await fetchPlayerDetails(hit, sport);
      expect(details.name.length).toBeGreaterThan(1);
      expect(details.id).toBeTruthy();
      const hasStats =
        (details.heroStats?.length ?? 0) > 0 ||
        (details.seasonSplits?.length ?? 0) > 0 ||
        (details.seasonHistory?.length ?? 0) > 0;
      expect(hasStats || details.height || details.headshot).toBeTruthy();
    }, 45_000);
  }

  it('fetchTeams returns logos for major sports', async () => {
    for (const sport of ['BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY', 'SOCCER'] as SportType[]) {
      const teams = await fetchTeams(sport);
      expect(teams.length).toBeGreaterThan(5);
      const withLogo = teams.filter((t) => t.logo?.startsWith('http'));
      expect(withLogo.length).toBeGreaterThan(3);
    }
  }, 60_000);
});
