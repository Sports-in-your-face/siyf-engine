import {
  resolveEspnCompetitorField,
  resolveEspnCompetitorFieldWithTrace,
} from '../../adjuster/espnResolver';
import {
  resolveEspnDisplayClock,
  resolveEspnEventField,
  resolveEspnEventFieldWithTrace,
  resolveEspnStatusState,
  type EspnResolveContext,
} from '../../adjuster/espnEventResolver';
import type { EspnCompetitorField, EspnEventField } from '../../adjuster/registry';
import type {
  AclResolveContext,
  CanonicalCompetitorField,
  CanonicalEventField,
  FieldResolveResult,
  UpstreamAdapter,
} from '../types';

function isEspnEvent(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return 'id' in o || 'competitions' in o || 'status' in o || 'uid' in o;
}

function toEspnEventField(field: CanonicalEventField): EspnEventField {
  return field as EspnEventField;
}

function toEspnCompetitorField(field: CanonicalCompetitorField): EspnCompetitorField {
  return field as EspnCompetitorField;
}

function toEspnCtx(ctx?: AclResolveContext): EspnResolveContext | undefined {
  if (!ctx?.sport && !ctx?.gameId) return undefined;
  return { sport: ctx.sport, gameId: ctx.gameId };
}

export const espnAdapter: UpstreamAdapter = {
  id: 'espn',
  priority: 0,

  canHandle(raw: unknown): boolean {
    return isEspnEvent(raw);
  },

  resolveEventField(raw: unknown, field: CanonicalEventField, ctx?: AclResolveContext): unknown {
    return resolveEspnEventField(raw, toEspnEventField(field));
  },

  resolveEventFieldWithTrace(
    raw: unknown,
    field: CanonicalEventField,
    ctx?: AclResolveContext,
  ): FieldResolveResult {
    const hit = resolveEspnEventFieldWithTrace(raw, toEspnEventField(field));
    return {
      value: hit.value,
      path: hit.path,
      source: hit.source,
      provider: 'espn',
    };
  },

  resolveCompetitorField(raw: unknown, field: CanonicalCompetitorField): unknown {
    return resolveEspnCompetitorField(raw, toEspnCompetitorField(field));
  },

  resolveCompetitorFieldWithTrace(
    raw: unknown,
    field: CanonicalCompetitorField,
  ): FieldResolveResult {
    const hit = resolveEspnCompetitorFieldWithTrace(raw, toEspnCompetitorField(field));
    return {
      value: hit.value,
      path: hit.path,
      source: hit.source,
      provider: 'espn',
    };
  },

  resolveStatusState(event: unknown, competition?: unknown): 'pre' | 'in' | 'post' | undefined {
    return resolveEspnStatusState(event, competition);
  },

  resolveDisplayClock(
    event: unknown,
    competition?: unknown,
    ctx?: AclResolveContext,
  ): unknown {
    return resolveEspnDisplayClock(event, competition, toEspnCtx(ctx));
  },
};
