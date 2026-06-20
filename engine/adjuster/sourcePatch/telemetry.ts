import { engineLogInfo, engineLogWarn } from '../../../config/engineLog';
import { getPatchStoreSnapshot, resetPatchStore } from './patchStore';

export interface SourcePatchEvent {
  chainId: string;
  endpointId: string;
  url: string;
  ok: boolean;
  patched: boolean;
  reason?: 'fetch_failed' | 'probe_failed';
  timestamp: number;
}

const patchHistory: SourcePatchEvent[] = [];
const MAX_HISTORY = 120;

export function recordSourcePatchEvent(event: SourcePatchEvent): void {
  patchHistory.push(event);
  if (patchHistory.length > MAX_HISTORY) patchHistory.shift();

  if (event.ok && event.patched) {
    engineLogInfo(`[source-patch] ${event.chainId} recovered via ${event.endpointId}`);
  } else if (!event.ok && event.reason === 'probe_failed') {
    engineLogWarn(`[source-patch] ${event.chainId} schema probe failed for ${event.endpointId}`);
  }
}

export function getSourcePatchHistory(chainId?: string): SourcePatchEvent[] {
  if (!chainId) return [...patchHistory];
  return patchHistory.filter((e) => e.chainId === chainId);
}

export function resetSourcePatchTelemetry(): void {
  patchHistory.length = 0;
}

declare global {
  interface Window {
    __siyfSourcePatch?: {
      getHistory: typeof getSourcePatchHistory;
      getStore: typeof getPatchStoreSnapshot;
      reset: () => void;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__siyfSourcePatch = {
    getHistory: getSourcePatchHistory,
    getStore: getPatchStoreSnapshot,
    reset: () => {
      resetPatchStore();
      resetSourcePatchTelemetry();
    },
  };
}
