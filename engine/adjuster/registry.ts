import type { FieldPath } from './fieldResolver';

/** ESPN competitor field aliases — extend when upstream moves fields. */
export const ESPN_COMPETITOR_ALIASES = {
  score: [
    ['score', 'displayValue'],
    ['score', 'value'],
    ['scoring', 'displayValue'],
    ['linescore', 'score', 'displayValue'],
    ['linescore', 'score'],
    ['score'],
  ],
  teamName: [
    ['team', 'displayName'],
    ['team', 'name'],
    ['team', 'shortDisplayName'],
    ['team', 'location'],
    ['athlete', 'displayName'],
    ['athlete', 'shortName'],
    ['name'],
  ],
  teamAbbr: [
    ['team', 'abbreviation'],
    ['team', 'abbr'],
    ['athlete', 'flag', 'abbreviation'],
  ],
  teamId: [
    ['team', 'id'],
    ['athlete', 'id'],
  ],
  record: [
    ['records', 0, 'summary'],
    ['record', 'summary'],
    ['records', 0, 'displayValue'],
  ],
  linescoreValue: [
    ['value'],
    ['displayValue'],
    ['value', 'displayValue'],
  ],
} as const satisfies Record<string, readonly FieldPath[]>;

export type EspnCompetitorField = keyof typeof ESPN_COMPETITOR_ALIASES;

export const ESPN_EVENT_ALIASES = {
  eventId: [['id'], ['uid'], ['guid']],
  statusState: [['status', 'type', 'state']],
  statusShortDetail: [['status', 'type', 'shortDetail'], ['status', 'type', 'detail']],
  displayClock: [['status', 'displayClock'], ['status', 'type', 'detail']],
  leagueAbbr: [
    ['leagues', 0, 'abbreviation'],
    ['competitions', 0, 'league', 'abbreviation'],
  ],
  leagueSlug: [
    ['leagues', 0, 'slug'],
    ['competitions', 0, 'league', 'slug'],
  ],
} as const satisfies Record<string, readonly FieldPath[]>;

export type EspnEventField = keyof typeof ESPN_EVENT_ALIASES;
