import type { MutationPath } from './mutations';
import {
  awayScorePath,
  awayTeamAbbrPath,
  awayTeamNamePath,
  awayTeamParentPath,
  cloneFixture,
  deleteAt,
  eventIdPath,
  moveField,
  renameKey,
  setAt,
  wrapInObject,
} from './mutations';

export interface ChaosScenario {
  id: string;
  /** Matches GoldenFixtureEntry.id */
  fixtureId: string;
  description: string;
  /** Registry + parser should still produce valid games */
  expectRecovery: boolean;
  /** Invariant codes expected when expectRecovery is false */
  expectedIssueCodes?: string[];
  /** Minimum games expected when recovered */
  minGames?: number;
  /** When true, mutation should yield zero parsed games */
  expectZeroGames?: boolean;
  mutate(raw: unknown): unknown;
}

function teamEvent(fixtureId: string): Pick<ChaosScenario, 'fixtureId'> {
  return { fixtureId };
}

/** Curated upstream drift simulations — extend when ESPN breaks something new. */
export const CHAOS_SCENARIOS: ChaosScenario[] = [
  {
    id: 'score-wrap-object',
    ...teamEvent('basketball-live'),
    description: 'ESPN wraps away score in { displayValue }',
    expectRecovery: true,
    mutate: (raw) => {
      const next = cloneFixture(raw);
      wrapInObject(next, awayScorePath());
      wrapInObject(next, [...['competitions', 0, 'competitors', 1] as MutationPath, 'score']);
      return next;
    },
  },
  {
    id: 'score-move-scoring',
    ...teamEvent('basketball-live'),
    description: 'ESPN moves score leaf to scoring.displayValue',
    expectRecovery: true,
    mutate: (raw) => {
      const next = cloneFixture(raw);
      moveField(next, awayScorePath(), [...awayScorePath().slice(0, -1), 'scoring', 'displayValue']);
      moveField(
        next,
        [...['competitions', 0, 'competitors', 1] as MutationPath, 'score'],
        [...['competitions', 0, 'competitors', 1] as MutationPath, 'scoring', 'displayValue'],
      );
      return next;
    },
  },
  {
    id: 'team-name-short-display',
    ...teamEvent('basketball-live'),
    description: 'ESPN drops displayName, keeps shortDisplayName only',
    expectRecovery: true,
    mutate: (raw) => {
      const next = cloneFixture(raw);
      for (const comp of [0, 1] as const) {
        const parent: MutationPath = ['competitions', 0, 'competitors', comp, 'team'];
        renameKey(next, parent, 'displayName', 'shortDisplayName');
      }
      return next;
    },
  },
  {
    id: 'team-abbr-rename',
    ...teamEvent('basketball-live'),
    description: 'ESPN renames abbreviation → abbr',
    expectRecovery: true,
    mutate: (raw) => {
      const next = cloneFixture(raw);
      for (const comp of [0, 1] as const) {
        const parent: MutationPath = ['competitions', 0, 'competitors', comp, 'team'];
        renameKey(next, parent, 'abbreviation', 'abbr');
      }
      return next;
    },
  },
  {
    id: 'football-score-wrap',
    ...teamEvent('football-scheduled'),
    description: 'NFL feed wraps scores in objects',
    expectRecovery: true,
    mutate: (raw) => {
      const next = cloneFixture(raw);
      wrapInObject(next, awayScorePath());
      wrapInObject(next, [...['competitions', 0, 'competitors', 1] as MutationPath, 'score']);
      return next;
    },
  },
  {
    id: 'soccer-score-move-scoring',
    ...teamEvent('soccer-epl-live'),
    description: 'Soccer feed moves score to scoring.displayValue',
    expectRecovery: true,
    mutate: (raw) => {
      const next = cloneFixture(raw);
      moveField(next, awayScorePath(), [...awayScorePath().slice(0, -1), 'scoring', 'displayValue']);
      moveField(
        next,
        [...['competitions', 0, 'competitors', 1] as MutationPath, 'score'],
        [...['competitions', 0, 'competitors', 1] as MutationPath, 'scoring', 'displayValue'],
      );
      return next;
    },
  },
  {
    id: 'delete-away-team-name',
    ...teamEvent('basketball-live'),
    description: 'Missing away team name should fail invariants',
    expectRecovery: false,
    expectedIssueCodes: ['team.name.missing'],
    mutate: (raw) => {
      const next = cloneFixture(raw);
      deleteAt(next, awayTeamNamePath());
      deleteAt(next, [...awayTeamParentPath(), 'name']);
      deleteAt(next, [...awayTeamParentPath(), 'shortDisplayName']);
      deleteAt(next, awayTeamAbbrPath());
      deleteAt(next, [...awayTeamParentPath(), 'abbr']);
      return next;
    },
  },
  {
    id: 'delete-event-id',
    ...teamEvent('basketball-live'),
    description: 'Missing event id should skip parse entirely',
    expectRecovery: false,
    expectZeroGames: true,
    mutate: (raw) => {
      const next = cloneFixture(raw);
      deleteAt(next, eventIdPath());
      return next;
    },
  },
  {
    id: 'strip-all-scores',
    ...teamEvent('hockey-live'),
    description: 'Null scores on scheduled-like payload still parse team names',
    expectRecovery: true,
    mutate: (raw) => {
      const next = cloneFixture(raw);
      setScoreNull(next, 0);
      setScoreNull(next, 1);
      return next;
    },
  },
];

function setScoreNull(root: unknown, compIndex: number): void {
  setAt(root, ['competitions', 0, 'competitors', compIndex, 'score'], null);
}
