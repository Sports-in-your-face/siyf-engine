import type { AnGame } from '../../sources/actionNetworkSource';
import type {
  AclResolveContext,
  CanonicalCompetitorField,
  CanonicalEventField,
  FieldResolveResult,
  UpstreamAdapter,
} from '../types';

export function isActionNetworkGame(raw: unknown): raw is AnGame {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return typeof o.id === 'number' && Array.isArray(o.teams) && 'away_team_id' in o;
}

function parseAnState(status: string): 'pre' | 'in' | 'post' | undefined {
  const s = (status ?? '').toLowerCase();
  if (/final|complete|closed/.test(s)) return 'post';
  if (/inprogress|in_progress|live|halftime|half|overtime|ot\b|q\d|period/.test(s)) return 'in';
  if (/scheduled|pregame|pre-game|created/.test(s)) return 'pre';
  return undefined;
}

function emptyResult(): FieldResolveResult {
  return { value: undefined, path: null, source: 'none', provider: 'actionNetwork' };
}

export const actionNetworkAdapter: UpstreamAdapter = {
  id: 'actionNetwork',
  priority: 1,

  canHandle(raw: unknown): boolean {
    return isActionNetworkGame(raw);
  },

  resolveEventField(raw: unknown, field: CanonicalEventField): unknown {
    if (!isActionNetworkGame(raw)) return undefined;
    switch (field) {
      case 'eventId':
        return `an-${raw.id}`;
      case 'statusState':
        return parseAnState(raw.real_status ?? raw.status);
      case 'statusShortDetail':
        return raw.status_display ?? raw.status;
      case 'displayClock':
        return raw.boxscore?.clock ?? raw.status_display;
      default:
        return undefined;
    }
  },

  resolveEventFieldWithTrace(raw: unknown, field: CanonicalEventField): FieldResolveResult {
    const value = this.resolveEventField(raw, field);
    if (value === undefined || value === null) return emptyResult();
    return {
      value,
      path: `actionNetwork.${field}`,
      source: 'actionNetwork',
      provider: 'actionNetwork',
    };
  },

  resolveCompetitorField(_raw: unknown, _field: CanonicalCompetitorField): unknown {
    return undefined;
  },

  resolveCompetitorFieldWithTrace(): FieldResolveResult {
    return emptyResult();
  },

  resolveStatusState(event: unknown): 'pre' | 'in' | 'post' | undefined {
    if (!isActionNetworkGame(event)) return undefined;
    return parseAnState(event.real_status ?? event.status);
  },

  resolveDisplayClock(event: unknown, _competition?: unknown, _ctx?: AclResolveContext): unknown {
    if (!isActionNetworkGame(event)) return undefined;
    return event.boxscore?.clock ?? event.status_display;
  },
};
