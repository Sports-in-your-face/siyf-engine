/** ESPN event/competition shapes used by parseGameEvent. */

export interface EspnImageRef {
  href?: string;
}

export interface EspnStatusType {
  state?: 'pre' | 'in' | 'post';
  name?: string;
  shortDetail?: string;
  detail?: string;
  completed?: boolean;
}

export interface EspnStatus {
  type?: EspnStatusType;
  displayClock?: string;
}

export interface EspnTeamEntity {
  id?: string | number;
  displayName?: string;
  name?: string;
  abbreviation?: string;
  color?: string;
  alternateColor?: string;
  logo?: string;
  logos?: EspnImageRef[];
}

export interface EspnAthleteEntity {
  id?: string | number;
  displayName?: string;
  shortName?: string;
  position?: { abbreviation?: string };
  headshot?: string | EspnImageRef;
  jersey?: string;
  flag?: { abbreviation?: string; href?: string };
}

export interface EspnStatistic {
  name?: string;
  abbreviation?: string;
  displayName?: string;
  displayValue?: string | number;
}

export interface EspnLeaderEntry {
  athlete?: EspnAthleteEntity;
  displayValue?: string | number;
}

export interface EspnLeaderGroup {
  name?: string;
  shortDisplayName?: string;
  abbreviation?: string;
  displayName?: string;
  leaders?: EspnLeaderEntry[];
}

export interface EspnCompetitor {
  id?: string;
  homeAway?: 'home' | 'away';
  order?: number;
  score?: unknown;
  team?: EspnTeamEntity;
  athlete?: EspnAthleteEntity;
  linescores?: Array<{ value?: unknown }>;
  linescore?: { score?: unknown };
  records?: Array<{ summary?: string }>;
  statistics?: EspnStatistic[];
  leaders?: EspnLeaderGroup[];
}

export interface EspnCompetitionDetail {
  clock?: { displayValue?: string };
  period?: { displayValue?: string };
  type?: { text?: string };
  athletesInvolved?: Array<{ displayName?: string }>;
  text?: string;
  shortText?: string;
}

export interface EspnLeagueRef {
  abbreviation?: string;
  slug?: string;
}

export interface EspnCompetition {
  id?: string;
  type?: { abbreviation?: string };
  league?: EspnLeagueRef;
  competitors?: EspnCompetitor[];
  status?: EspnStatus;
  details?: EspnCompetitionDetail[];
}

export interface EspnGameEvent {
  id: string | number;
  name?: string;
  status?: EspnStatus;
  leagues?: EspnLeagueRef[];
  competitions?: EspnCompetition[];
}

export function isEspnGameEvent(raw: unknown): raw is EspnGameEvent {
  if (!raw || typeof raw !== 'object') return false;
  const id = (raw as EspnGameEvent).id;
  return id !== undefined && id !== null && String(id).length > 0;
}
