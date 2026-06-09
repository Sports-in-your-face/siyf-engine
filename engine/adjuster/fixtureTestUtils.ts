import type { Game } from '../../types';
import { parseEventsForSport } from '../../services/parsers/parseGameEvent';
import { parseFightEvents } from '../../services/parsers/parseFightEvents';
import { parseGolfEvents } from '../../services/parsers/parseGolfEvents';
import { parseTennisEvents } from '../../services/parsers/parseTennisEvents';
import type { FixtureParserKind, GoldenFixtureEntry } from './fixtureManifest';
import { GOLDEN_FIXTURES } from './fixtureManifest';

const fixtureModules = import.meta.glob('./__fixtures__/**/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

export function loadGoldenFixture(relativePath: string): unknown {
  const key = `./__fixtures__/${relativePath}`;
  const data = fixtureModules[key];
  if (!data) throw new Error(`Missing fixture: ${relativePath}`);
  return data;
}

export function getGoldenFixtureById(id: string): GoldenFixtureEntry {
  const entry = GOLDEN_FIXTURES.find((f) => f.id === id);
  if (!entry) throw new Error(`Unknown fixture id: ${id}`);
  return entry;
}

export function parseGoldenFixture(
  parser: FixtureParserKind,
  sport: string,
  raw: unknown,
): Game[] {
  const events = [raw];
  switch (parser) {
    case 'team':
      return parseEventsForSport(events, sport as Parameters<typeof parseEventsForSport>[1]);
    case 'tennis':
      return parseTennisEvents(events, 'ATP');
    case 'golf':
      return parseGolfEvents(events, 'PGA');
    case 'fight':
      return parseFightEvents(events, 'UFC');
    default:
      return [];
  }
}
