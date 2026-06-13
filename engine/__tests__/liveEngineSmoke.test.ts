/**
 * Broad live smoke: scoreboards, standings, rosters, game detail, edge cases.
 * Run: cross-env SIYF_LIVE_SMOKE=1 npx vitest run engine/__tests__/liveEngineSmoke.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  fetchGames,
  fetchGameDetail,
  fetchStandings,
  fetchTeams,
  fetchTeamRoster,
  fetchTeamSchedule,
  searchPlayersForSport,
  fetchPlayerDetails,
  type SportType,
} from '../../services/api';
import { fetchBartTorvikStandings } from '../sources/analyticsSources';

const LIVE = process.env.SIYF_LIVE_SMOKE === '1';

const ALL_SPORTS: SportType[] = [
  'BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY', 'SOCCER', 'TENNIS', 'GOLF', 'FIGHTS',
];

const STANDINGS_SPORTS: SportType[] = ['BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY', 'SOCCER'];

const ROSTER_CASES: { sport: SportType; abbr: string; minPlayers: number }[] = [
  { sport: 'BASKETBALL', abbr: 'OKC', minPlayers: 10 },
  { sport: 'FOOTBALL', abbr: 'KC', minPlayers: 20 },
  { sport: 'BASEBALL', abbr: 'LAD', minPlayers: 15 },
  { sport: 'HOCKEY', abbr: 'EDM', minPlayers: 15 },
  { sport: 'SOCCER', abbr: 'MNC', minPlayers: 10 },
];

const PARTIAL_SEARCH: { sport: SportType; query: string; expectInName: string }[] = [
  { sport: 'BASKETBALL', query: 'Curry', expectInName: 'Curry' },
  { sport: 'FOOTBALL', query: 'Mahomes', expectInName: 'Mahomes' },
  { sport: 'BASEBALL', query: 'Judge', expectInName: 'Judge' },
  { sport: 'HOCKEY', query: 'McDavid', expectInName: 'McDavid' },
  { sport: 'SOCCER', query: 'Haaland', expectInName: 'Haaland' },
  { sport: 'TENNIS', query: 'Sinner', expectInName: 'Sinner' },
  { sport: 'GOLF', query: 'Scheffler', expectInName: 'Scheffler' },
  { sport: 'FIGHTS', query: 'Pereira', expectInName: 'Pereira' },
];

const PROFILE_ALL_SPORTS: { sport: SportType; name: string }[] = [
  { sport: 'SOCCER', name: 'Erling Haaland' },
  { sport: 'SOCCER', name: 'Mohamed Salah' },
  { sport: 'TENNIS', name: 'Novak Djokovic' },
  { sport: 'TENNIS', name: 'Coco Gauff' },
  { sport: 'GOLF', name: 'Scottie Scheffler' },
  { sport: 'GOLF', name: 'Nelly Korda' },
  { sport: 'FIGHTS', name: 'Kamaru Usman' },
  { sport: 'FIGHTS', name: 'Leon Edwards' },
  { sport: 'FIGHTS', name: 'Alex Pereira' },
];

describe.skipIf(!LIVE)('live engine smoke', () => {
  for (const sport of ALL_SPORTS) {
    it(`${sport}: scoreboard parses without throw`, async () => {
      const games = await fetchGames(sport);
      expect(Array.isArray(games)).toBe(true);
      for (const g of games.slice(0, 5)) {
        expect(g.id).toBeTruthy();
        expect(g.sport).toBeTruthy();
        expect(typeof g.status).toBe('string');
      }
    }, 30_000);
  }

  for (const sport of STANDINGS_SPORTS) {
    it(`${sport}: standings have rows`, async () => {
      const groups = await fetchStandings(sport);
      expect(groups.length).toBeGreaterThan(0);
      const rows = groups.reduce((n, g) => n + (g.rows?.length ?? 0), 0);
      expect(rows).toBeGreaterThan(8);
      const first = groups[0]?.rows?.[0];
      expect(first?.team?.name).toBeTruthy();
      expect(first?.team?.abbr).toBeTruthy();
    }, 30_000);
  }

  it('Bart Torvik standings parse without crash', async () => {
    const groups = await fetchBartTorvikStandings();
    expect(Array.isArray(groups)).toBe(true);
    if (groups.length) {
      const rows = groups.reduce((n, g) => n + (g.rows?.length ?? 0), 0);
      expect(rows).toBeGreaterThan(0);
      expect(groups[0].rows[0].team.name).toBeTruthy();
    }
  }, 20_000);

  for (const { sport, abbr, minPlayers } of ROSTER_CASES) {
    it(`${sport}: roster for ${abbr}`, async () => {
      const teams = await fetchTeams(sport);
      const team = teams.find((t) => t.abbr?.toUpperCase() === abbr);
      expect(team, `team ${abbr} not found among ${teams.length} teams`).toBeTruthy();

      const rosterId = String(team!.espnId ?? team!.id);
      expect(rosterId).toMatch(/^\d+$/);

      const roster = await fetchTeamRoster(sport, rosterId);
      expect(roster.length).toBeGreaterThanOrEqual(minPlayers);
      const withName = roster.filter((p) => p.name?.length > 2);
      expect(withName.length).toBeGreaterThanOrEqual(minPlayers);
      const numericIds = roster.filter((p) => /^\d+$/.test(String(p.id)));
      expect(numericIds.length).toBeGreaterThan(5);
    }, 45_000);
  }

  for (const { sport, abbr } of ROSTER_CASES.slice(0, 3)) {
    it(`${sport}: schedule for ${abbr}`, async () => {
      const teams = await fetchTeams(sport);
      const team = teams.find((t) => t.abbr?.toUpperCase() === abbr);
      expect(team).toBeTruthy();
      const schedule = await fetchTeamSchedule(sport, String(team!.espnId ?? team!.id));
      expect(Array.isArray(schedule)).toBe(true);
    }, 30_000);
  }

  for (const { sport, query, expectInName } of PARTIAL_SEARCH) {
    it(`${sport}: partial search "${query}"`, async () => {
      const results = await searchPlayersForSport(sport, query);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((p) => p.name.includes(expectInName))).toBe(true);
    }, 20_000);
  }

  for (const { sport, name } of PROFILE_ALL_SPORTS) {
    it(`${sport}: full profile "${name}"`, async () => {
      const results = await searchPlayersForSport(sport, name);
      const hit = results.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? results[0];
      expect(hit?.id).toMatch(/^\d+$/);

      const details = await fetchPlayerDetails(hit, sport);
      expect(details.name.length).toBeGreaterThan(1);
      expect(
        (details.heroStats?.length ?? 0) > 0 ||
        (details.seasonSplits?.length ?? 0) > 0 ||
        (details.seasonHistory?.length ?? 0) > 0 ||
        details.height ||
        details.headshot ||
        details.bio,
      ).toBeTruthy();
    }, 60_000);
  }

  for (const sport of ['BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY'] as SportType[]) {
    it(`${sport}: game detail enriches first scoreboard game`, async () => {
      const games = await fetchGames(sport);
      if (!games.length) return;

      const game = games[0];
      const enriched = await fetchGameDetail(game, sport);
      expect(enriched.id).toBe(game.id);
      expect(enriched.away?.name).toBeTruthy();
      expect(enriched.home?.name).toBeTruthy();
    }, 45_000);
  }

  it('BASKETBALL: duplicate last name disambiguation (Allen)', async () => {
    const results = await searchPlayersForSport('BASKETBALL', 'Allen');
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((p) => /^\d+$/.test(String(p.id)))).toBe(true);
  }, 20_000);

  it('teams have unique abbr per sport', async () => {
    for (const sport of STANDINGS_SPORTS) {
      const teams = await fetchTeams(sport);
      const abbrs = teams.map((t) => t.abbr?.toUpperCase()).filter(Boolean);
      const unique = new Set(abbrs);
      expect(unique.size).toBe(abbrs.length);
    }
  }, 60_000);
});
