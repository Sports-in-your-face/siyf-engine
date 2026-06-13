/** Provider-agnostic canonical field names — stable outside upstream shapes. */
export type CanonicalEventField =
  | 'eventId'
  | 'statusState'
  | 'statusShortDetail'
  | 'displayClock'
  | 'leagueAbbr'
  | 'leagueSlug';

export type CanonicalCompetitorField =
  | 'score'
  | 'teamName'
  | 'teamAbbr'
  | 'teamId'
  | 'record'
  | 'linescoreValue';

export type UpstreamProviderId = 'espn' | 'actionNetwork';

export interface AclResolveContext {
  sport?: string;
  gameId?: string;
  /** Secondary upstream payloads for field fallback (e.g. AN scores when ESPN path missing). */
  fallbacks?: Partial<Record<UpstreamProviderId, unknown>>;
}

export interface FieldResolveResult {
  value: unknown;
  path: string | null;
  source: string;
  provider: UpstreamProviderId;
}

export interface UpstreamAdapter {
  id: UpstreamProviderId;
  priority: number;
  canHandle(raw: unknown): boolean;
  resolveEventField(
    raw: unknown,
    field: CanonicalEventField,
    ctx?: AclResolveContext,
  ): unknown;
  resolveEventFieldWithTrace(
    raw: unknown,
    field: CanonicalEventField,
    ctx?: AclResolveContext,
  ): FieldResolveResult;
  resolveCompetitorField(raw: unknown, field: CanonicalCompetitorField): unknown;
  resolveCompetitorFieldWithTrace(
    raw: unknown,
    field: CanonicalCompetitorField,
  ): FieldResolveResult;
  resolveStatusState(
    event: unknown,
    competition?: unknown,
  ): 'pre' | 'in' | 'post' | undefined;
  resolveDisplayClock(
    event: unknown,
    competition?: unknown,
    ctx?: AclResolveContext,
  ): unknown;
}

/** Fields that Action Network can backfill when ESPN resolution fails. */
export const AN_FALLBACK_EVENT_FIELDS = new Set<CanonicalEventField>([
  'displayClock',
  'statusShortDetail',
  'statusState',
]);
