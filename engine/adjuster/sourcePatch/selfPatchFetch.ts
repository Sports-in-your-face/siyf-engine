import { createEngineLog } from '../../core/engineUtils';
import { fetchJsonResilient } from '../../core/resilientFetch';
import type { EndpointCandidate } from './endpointRegistry';
import { getPreferredEndpointIndex, rememberPreferredEndpoint } from './patchStore';
import { probeForKind, type SourceProbeKind } from './responseProbes';
import { recordSourcePatchEvent, type SourcePatchEvent } from './telemetry';

const log = createEngineLog('source-patch');

export interface SelfPatchFetchConfig {
  chainId: string;
  candidates: readonly EndpointCandidate[];
  probe: SourceProbeKind | ((raw: unknown) => boolean);
  label: string;
  bypassCache?: boolean;
}

export interface SelfPatchFetchResult<T> {
  data: T | null;
  endpointId: string | null;
  patched: boolean;
  attempts: SourcePatchEvent[];
}

function runProbe(
  probe: SourceProbeKind | ((raw: unknown) => boolean),
  raw: unknown,
): boolean {
  return typeof probe === 'function' ? probe(raw) : probeForKind(probe, raw);
}

function rotateCandidates(
  candidates: readonly EndpointCandidate[],
  preferredIndex: number,
): EndpointCandidate[] {
  if (!candidates.length) return [];
  const safe = preferredIndex % candidates.length;
  return [
    ...candidates.slice(safe),
    ...candidates.slice(0, safe),
  ];
}

/**
 * Try an ordered endpoint chain until one returns probe-valid JSON.
 * Remembers the winning endpoint for the chain (session + localStorage).
 */
export async function fetchWithSelfPatch<T = unknown>(
  config: SelfPatchFetchConfig,
): Promise<SelfPatchFetchResult<T>> {
  const { chainId, candidates, probe, label, bypassCache = false } = config;
  const attempts: SourcePatchEvent[] = [];

  if (!candidates.length) {
    return { data: null, endpointId: null, patched: false, attempts };
  }

  const preferred = getPreferredEndpointIndex(chainId);
  const order = rotateCandidates(candidates, preferred);

  for (let i = 0; i < order.length; i++) {
    const candidate = order[i];
    const event: SourcePatchEvent = {
      chainId,
      endpointId: candidate.id,
      url: candidate.url,
      ok: false,
      patched: i > 0 || preferred > 0,
      timestamp: Date.now(),
    };

    const raw = await fetchJsonResilient<T>(
      candidate.url,
      undefined,
      {
        label: `${label}:${candidate.id}`,
        retries: i === 0 ? 2 : 1,
        bypassCache: bypassCache || i > 0,
        throwOnTransientError: false,
      },
    );

    if (raw == null) {
      event.reason = 'fetch_failed';
      attempts.push(event);
      recordSourcePatchEvent(event);
      continue;
    }

    if (!runProbe(probe, raw)) {
      event.reason = 'probe_failed';
      attempts.push(event);
      recordSourcePatchEvent(event);
      log('warn', chainId, `probe failed for ${candidate.id}`, candidate.url);
      continue;
    }

    event.ok = true;
    event.patched = i > 0;
    attempts.push(event);
    recordSourcePatchEvent(event);

    const absoluteIndex = candidates.findIndex((c) => c.id === candidate.id);
    if (absoluteIndex >= 0) {
      rememberPreferredEndpoint(chainId, absoluteIndex);
    }

    if (i > 0) {
      log('info', chainId, `self-patched → ${candidate.id}`);
    }

    return {
      data: raw,
      endpointId: candidate.id,
      patched: i > 0,
      attempts,
    };
  }

  log('warn', chainId, `all ${order.length} endpoint(s) exhausted`);
  return { data: null, endpointId: null, patched: false, attempts };
}
