import type { Game } from '../../../types';
import type { SportType } from '../../../services/api';
import { dedupeGamesById } from '../../core/mergeGames';
import { makeGame, makeOddsContext, makeTeam } from '../../core/__tests__/fixtures';
import { loadGoldenFixture } from '../fixtureTestUtils';
import {
  runMergePipeline,
  validateDedupeHealth,
  validateMergeHealth,
  type MergeHealthInput,
} from '../invariants/merge';
import { validateGameOdds } from '../invariants/odds';
import type { ParseInvariantIssue } from '../invariants/types';
import { parseEspnSource, parseNcaaSource, parseWnbaEspnSource } from '../liveSmoke/parseSource';
import { simulateEspnActionNetworkMerge } from '../liveSmoke/mergeSmoke';

export interface MergeScenarioRunResult {
  primary: Game[];
  secondary: Game[];
  merged: Game[];
  deduped?: Game[];
  issues: ParseInvariantIssue[];
}

export interface MergeScenario {
  id: string;
  description: string;
  expectHealthy: boolean;
  expectedIssueCodes?: string[];
  run(): MergeScenarioRunResult;
}

function syntheticAnGame(
  away: { name: string; abbr: string },
  home: { name: string; abbr: string },
  odds?: { spread: string; total: string; book: string },
): Game {
  return makeGame({
    id: `an-${away.abbr}-${home.abbr}`,
    away: makeTeam({ name: away.name, abbr: away.abbr }),
    home: makeTeam({ name: home.name, abbr: home.abbr }),
    context: odds
      ? makeOddsContext({ oddsSpread: odds.spread, oddsTotal: odds.total, oddsBook: odds.book })
      : undefined,
  });
}

function espnFixtureMerge(
  sport: SportType,
  fixturePath: string,
  anLeague: string,
  anRaw?: unknown,
): MergeScenarioRunResult {
  const espnRaw = { events: [loadGoldenFixture(fixturePath)] };
  const result = simulateEspnActionNetworkMerge(
    `fixture-${sport}`,
    sport,
    espnRaw,
    anRaw ?? loadGoldenFixture('action-network/nba-live.json'),
    anLeague,
  );
  return {
    primary: result.espnGames,
    secondary: result.anGames,
    merged: result.merged,
    issues: result.mergeIssues,
  };
}

export const MERGE_SCENARIOS: MergeScenario[] = [
  {
    id: 'espn-an-nba-healthy',
    description: 'ESPN + Action Network NBA golden merge stays healthy',
    expectHealthy: true,
    run() {
      const espnRaw = { events: [loadGoldenFixture('basketball/live-standard.json')] };
      const anRaw = loadGoldenFixture('action-network/nba-live.json');
      const result = simulateEspnActionNetworkMerge('espn-an-nba', 'BASKETBALL', espnRaw, anRaw, 'nba');
      const pipeline = runMergePipeline({
        primary: result.espnGames,
        secondary: result.anGames,
        secondaryLabel: 'action-network',
      });
      return {
        primary: result.espnGames,
        secondary: result.anGames,
        merged: pipeline.merged,
        issues: pipeline.allIssues,
      };
    },
  },
  {
    id: 'espn-an-orphan-odds',
    description: 'Action Network odds with no ESPN matchup are flagged as orphan',
    expectHealthy: true,
    expectedIssueCodes: ['merge.orphan_odds'],
    run() {
      const espnRaw = { events: [loadGoldenFixture('basketball/live-standard.json')] };
      const anFixture = loadGoldenFixture('action-network/nba-live.json') as { games: Record<string, unknown>[] };
      const anRaw = {
        games: [{
          ...anFixture.games[0],
          teams: [
            { id: 99, full_name: 'Miami Heat', abbr: 'MIA' },
            { id: 98, full_name: 'New York Knicks', abbr: 'NYK' },
          ],
          away_team_id: 99,
          home_team_id: 98,
        }],
      };
      const result = simulateEspnActionNetworkMerge('espn-an-orphan', 'BASKETBALL', espnRaw, anRaw, 'nba');
      const issues = validateMergeHealth({
        primary: result.espnGames,
        secondary: result.anGames,
        merged: result.merged,
        secondaryLabel: 'action-network',
      });
      return {
        primary: result.espnGames,
        secondary: result.anGames,
        merged: result.merged,
        issues,
      };
    },
  },
  {
    id: 'wnba-nba-dedupe-coexist',
    description: 'Same ESPN id across WNBA and NBA survives dedupe',
    expectHealthy: true,
    run() {
      const nba = makeGame({
        id: '99',
        sport: 'NBA',
        away: makeTeam({ name: 'Hawks', abbr: 'ATL' }),
        home: makeTeam({ name: 'Bulls', abbr: 'CHI' }),
      });
      const wnba = makeGame({
        ...nba,
        sport: 'WNBA',
        away: makeTeam({ name: 'Dream', abbr: 'ATL' }),
        home: makeTeam({ name: 'Sky', abbr: 'CHI' }),
      });
      const combined = [nba, wnba];
      const deduped = dedupeGamesById(combined);
      const issues = validateDedupeHealth(combined);
      return { primary: combined, secondary: [], merged: deduped, deduped, issues };
    },
  },
  {
    id: 'soccer-multi-league-dedupe',
    description: 'Same id across soccer leagues survives dedupe',
    expectHealthy: true,
    run() {
      const epl = makeGame({
        id: '99',
        leagueSlug: 'eng.1',
        sport: 'SOCCER',
        away: makeTeam({ name: 'Arsenal', abbr: 'ARS' }),
        home: makeTeam({ name: 'Chelsea', abbr: 'CHE' }),
      });
      const mls = makeGame({
        ...epl,
        leagueSlug: 'usa.1',
        away: makeTeam({ name: 'LAFC', abbr: 'LAFC' }),
      });
      const combined = [epl, mls];
      const deduped = dedupeGamesById(combined);
      const issues = validateDedupeHealth(combined);
      return { primary: combined, secondary: [], merged: deduped, deduped, issues };
    },
  },
  {
    id: 'supplemental-basketball-dedupe',
    description: 'NBA ESPN + WNBA + NCAA supplemental feeds dedupe cleanly',
    expectHealthy: true,
    run() {
      const espn = parseEspnSource('BASKETBALL', {
        events: [loadGoldenFixture('basketball/live-standard.json')],
      });
      const wnba = parseWnbaEspnSource({
        events: [loadGoldenFixture('basketball/wnba-team-names.json')],
      });
      const ncaa = parseNcaaSource(loadGoldenFixture('supplemental/ncaa-game.json'));
      const combined = [...espn.games, ...wnba.games, ...ncaa.games];
      const deduped = dedupeGamesById(combined);
      const issues = validateDedupeHealth(combined);
      return {
        primary: espn.games,
        secondary: [...wnba.games, ...ncaa.games],
        merged: deduped,
        deduped,
        issues,
      };
    },
  },
  {
    id: 'dedupe-prefers-live',
    description: 'Dedupe keeps live row over scheduled duplicate in same league',
    expectHealthy: true,
    run() {
      const pre = makeGame({
        id: '1',
        leagueSlug: 'eng.1',
        sport: 'SOCCER',
        statusState: 'pre',
        away: makeTeam({ name: 'Arsenal', abbr: 'ARS', score: 0 }),
        home: makeTeam({ name: 'Chelsea', abbr: 'CHE', score: 0 }),
      });
      const live = makeGame({
        ...pre,
        statusState: 'in',
        away: { ...pre.away, score: 1 },
      });
      const combined = [pre, live];
      const deduped = dedupeGamesById(combined);
      const issues = validateDedupeHealth(combined);
      return {
        primary: combined,
        secondary: [],
        merged: deduped,
        deduped,
        issues,
      };
    },
  },
  {
    id: 'football-an-merge',
    description: 'ESPN football fixture merges with synthetic Action Network odds',
    expectHealthy: true,
    run() {
      const espn = parseEspnSource('FOOTBALL', {
        events: [loadGoldenFixture('football/live-object-score.json')],
      });
      const primary = espn.games[0];
      const secondary = [syntheticAnGame(
        { name: primary.away.name, abbr: primary.away.abbr },
        { name: primary.home.name, abbr: primary.home.abbr },
        { spread: `${primary.away.abbr} -3.5`, total: 'O/U 44.5', book: 'DRAFTKINGS' },
      )];
      const pipeline = runMergePipeline({
        primary: espn.games,
        secondary,
        secondaryLabel: 'action-network',
      });
      return {
        primary: espn.games,
        secondary,
        merged: pipeline.merged,
        issues: pipeline.allIssues,
      };
    },
  },
  {
    id: 'baseball-an-merge',
    description: 'ESPN baseball fixture merges with synthetic Action Network odds',
    expectHealthy: true,
    run() {
      const espn = parseEspnSource('BASEBALL', {
        events: [loadGoldenFixture('baseball/live-standard.json')],
      });
      const primary = espn.games[0];
      const secondary = [syntheticAnGame(
        { name: primary.away.name, abbr: primary.away.abbr },
        { name: primary.home.name, abbr: primary.home.abbr },
        { spread: `${primary.away.abbr} +1.5`, total: 'O/U 8.5', book: 'FANDUEL' },
      )];
      const pipeline = runMergePipeline({
        primary: espn.games,
        secondary,
        secondaryLabel: 'action-network',
      });
      return {
        primary: espn.games,
        secondary,
        merged: pipeline.merged,
        issues: pipeline.allIssues,
      };
    },
  },
  {
    id: 'hockey-an-merge',
    description: 'ESPN hockey fixture merges with synthetic Action Network odds',
    expectHealthy: true,
    run() {
      const espn = parseEspnSource('HOCKEY', {
        events: [loadGoldenFixture('hockey/live-standard.json')],
      });
      const primary = espn.games[0];
      const secondary = [syntheticAnGame(
        { name: primary.away.name, abbr: primary.away.abbr },
        { name: primary.home.name, abbr: primary.home.abbr },
        { spread: `${primary.away.abbr} -1.5`, total: 'O/U 6.5', book: 'BETMGM' },
      )];
      const pipeline = runMergePipeline({
        primary: espn.games,
        secondary,
        secondaryLabel: 'action-network',
      });
      return {
        primary: espn.games,
        secondary,
        merged: pipeline.merged,
        issues: pipeline.allIssues,
      };
    },
  },
  {
    id: 'soccer-an-merge',
    description: 'ESPN soccer fixture merges with synthetic Action Network odds',
    expectHealthy: true,
    run() {
      const result = espnFixtureMerge(
        'SOCCER',
        'soccer/epl-live.json',
        'epl',
        {
          games: [{
            id: 1,
            status: 'inprogress',
            away_team_id: 1,
            home_team_id: 2,
            teams: [
              { id: 1, full_name: 'Arsenal', abbr: 'ARS' },
              { id: 2, full_name: 'Chelsea', abbr: 'CHE' },
            ],
            odds: [{ type: 'game', book_id: 69, spread_away: 0.5, spread_home: -0.5, total: 2.5 }],
          }],
        },
      );
      const pipeline = runMergePipeline({
        primary: result.primary,
        secondary: result.secondary,
        secondaryLabel: 'action-network',
      });
      return {
        primary: result.primary,
        secondary: result.secondary,
        merged: pipeline.merged,
        issues: pipeline.allIssues,
      };
    },
  },
  {
    id: 'duplicate-matchup-gate',
    description: 'Duplicate matchup keys after merge are blocking errors',
    expectHealthy: false,
    expectedIssueCodes: ['merge.duplicate_key'],
    run() {
      const gameA = makeGame({
        id: 'dup-1',
        away: makeTeam({ name: 'Lakers', abbr: 'LAL' }),
        home: makeTeam({ name: 'Celtics', abbr: 'BOS' }),
      });
      const gameB = makeGame({
        id: 'dup-2',
        away: makeTeam({ name: 'Lakers', abbr: 'LAL' }),
        home: makeTeam({ name: 'Celtics', abbr: 'BOS' }),
      });
      const merged = [gameA, gameB];
      const input: MergeHealthInput = {
        primary: [gameA],
        secondary: [gameB],
        merged,
      };
      const issues = validateMergeHealth(input);
      return { primary: [gameA], secondary: [gameB], merged, issues };
    },
  },
  {
    id: 'merge-empty-result-gate',
    description: 'Merge that drops all primary games is a blocking error',
    expectHealthy: false,
    expectedIssueCodes: ['merge.empty_result'],
    run() {
      const primary = [makeGame({
        id: 'gone',
        away: makeTeam({ name: 'A', abbr: 'AAA' }),
        home: makeTeam({ name: 'B', abbr: 'BBB' }),
      })];
      const issues = validateMergeHealth({
        primary,
        secondary: [],
        merged: [],
      });
      return { primary, secondary: [], merged: [], issues };
    },
  },
  {
    id: 'odds-object-leak-gate',
    description: 'Object leak in odds spread is a blocking error',
    expectHealthy: false,
    expectedIssueCodes: ['odds.object_leak'],
    run() {
      const game = makeGame({
        id: 'leak-1',
        away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
        home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
        context: makeOddsContext({ oddsSpread: '[object Object]', oddsBook: 'DRAFTKINGS' }),
      });
      const issues = validateGameOdds(game);
      return { primary: [game], secondary: [], merged: [game], issues };
    },
  },
  {
    id: 'odds-book-missing-warn',
    description: 'Odds line without book label emits a warning',
    expectHealthy: true,
    expectedIssueCodes: ['odds.book_missing'],
    run() {
      const game = makeGame({
        id: 'book-1',
        away: makeTeam({ name: 'LAL', abbr: 'LAL' }),
        home: makeTeam({ name: 'BOS', abbr: 'BOS' }),
        context: makeOddsContext({ oddsSpread: 'LAL -4.5', oddsTotal: 'O/U 220.5' }),
      });
      const issues = validateGameOdds(game);
      return { primary: [game], secondary: [], merged: [game], issues };
    },
  },
];
