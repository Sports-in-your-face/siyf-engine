import { actionNetworkAdapter } from './adapters/actionNetwork';
import { espnAdapter } from './adapters/espn';
import type {
  AclResolveContext,
  CanonicalCompetitorField,
  CanonicalEventField,
  FieldResolveResult,
  UpstreamAdapter,
  UpstreamProviderId,
} from './types';
import { AN_FALLBACK_EVENT_FIELDS } from './types';

const ADAPTERS: UpstreamAdapter[] = [espnAdapter, actionNetworkAdapter].sort(
  (a, b) => a.priority - b.priority,
);

const adapterById: Record<UpstreamProviderId, UpstreamAdapter> = {
  espn: espnAdapter,
  actionNetwork: actionNetworkAdapter,
};

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function tryAdapterEventField(
  adapter: UpstreamAdapter,
  raw: unknown,
  field: CanonicalEventField,
  ctx?: AclResolveContext,
): unknown {
  if (!adapter.canHandle(raw)) return undefined;
  return adapter.resolveEventField(raw, field, ctx);
}

function tryFallbackEventField(
  field: CanonicalEventField,
  ctx?: AclResolveContext,
): unknown {
  const fallbacks = ctx?.fallbacks;
  if (!fallbacks) return undefined;
  if (!AN_FALLBACK_EVENT_FIELDS.has(field)) return undefined;

  const anRaw = fallbacks.actionNetwork;
  if (!anRaw) return undefined;
  return tryAdapterEventField(actionNetworkAdapter, anRaw, field, ctx);
}

export function getUpstreamAdapters(): readonly UpstreamAdapter[] {
  return ADAPTERS;
}

export function getAdapter(id: UpstreamProviderId): UpstreamAdapter {
  return adapterById[id];
}

export function resolveEventField(
  event: unknown,
  field: CanonicalEventField,
  ctx?: AclResolveContext,
): unknown {
  const primary = tryAdapterEventField(espnAdapter, event, field, ctx);
  if (hasValue(primary)) return primary;

  const fallback = tryFallbackEventField(field, ctx);
  if (hasValue(fallback)) return fallback;

  for (const adapter of ADAPTERS) {
    if (adapter.id === 'espn') continue;
    const value = tryAdapterEventField(adapter, event, field, ctx);
    if (hasValue(value)) return value;
  }

  return undefined;
}

export function resolveEventFieldWithTrace(
  event: unknown,
  field: CanonicalEventField,
  ctx?: AclResolveContext,
): FieldResolveResult {
  const primary = espnAdapter.resolveEventFieldWithTrace(event, field, ctx);
  if (hasValue(primary.value)) return primary;

  const anRaw = ctx?.fallbacks?.actionNetwork;
  if (anRaw && AN_FALLBACK_EVENT_FIELDS.has(field)) {
    const anHit = actionNetworkAdapter.resolveEventFieldWithTrace(anRaw, field, ctx);
    if (hasValue(anHit.value)) return anHit;
  }

  for (const adapter of ADAPTERS) {
    if (adapter.id === 'espn') continue;
    if (!adapter.canHandle(event)) continue;
    const hit = adapter.resolveEventFieldWithTrace(event, field, ctx);
    if (hasValue(hit.value)) return hit;
  }

  return { value: undefined, path: null, source: 'none', provider: 'espn' };
}

export function resolveCompetitorField(
  comp: unknown,
  field: CanonicalCompetitorField,
): unknown {
  for (const adapter of ADAPTERS) {
    if (!adapter.canHandle(comp)) continue;
    const value = adapter.resolveCompetitorField(comp, field);
    if (hasValue(value)) return value;
  }
  return espnAdapter.resolveCompetitorField(comp, field);
}

export function resolveCompetitorFieldWithTrace(
  comp: unknown,
  field: CanonicalCompetitorField,
): FieldResolveResult {
  for (const adapter of ADAPTERS) {
    if (!adapter.canHandle(comp)) continue;
    const hit = adapter.resolveCompetitorFieldWithTrace(comp, field);
    if (hasValue(hit.value)) return hit;
  }
  return espnAdapter.resolveCompetitorFieldWithTrace(comp, field);
}

export function resolveStatusState(
  event: unknown,
  competition?: unknown,
): 'pre' | 'in' | 'post' | undefined {
  const espn = espnAdapter.resolveStatusState(event, competition);
  if (espn) return espn;
  return actionNetworkAdapter.resolveStatusState(event);
}

export function resolveDisplayClock(
  event: unknown,
  competition?: unknown,
  ctx?: AclResolveContext,
): unknown {
  const primary = espnAdapter.resolveDisplayClock(event, competition, ctx);
  if (hasValue(primary)) return primary;
  return tryFallbackEventField('displayClock', ctx);
}
