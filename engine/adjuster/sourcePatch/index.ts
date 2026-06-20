export {
  ESPN_EVENTS_PATH_ALIASES,
  YAHOO_SCOREBOARD_ROOT_ALIASES,
  extractEspnEventsFromRaw,
  extractYahooScoreboardRoot,
  discoverEspnEventsArray,
  discoverYahooScoreboardRoot,
} from './schemaPaths';

export { probeEspnScoreboard, probeYahooScoreboard, probeForKind } from './responseProbes';
export type { SourceProbeKind } from './responseProbes';

export {
  espnScoreboardEndpointChain,
  espnScoreboardChainId,
  espnCustomScoreboardChain,
  yahooScoreboardEndpointChain,
  YAHOO_SCOREBOARD_CHAIN_ID,
} from './endpointRegistry';
export type { EndpointCandidate } from './endpointRegistry';

export {
  getPreferredEndpointIndex,
  rememberPreferredEndpoint,
  resetPatchStore,
  getPatchStoreSnapshot,
} from './patchStore';

export { fetchWithSelfPatch } from './selfPatchFetch';
export type { SelfPatchFetchConfig, SelfPatchFetchResult } from './selfPatchFetch';

export {
  recordSourcePatchEvent,
  getSourcePatchHistory,
  resetSourcePatchTelemetry,
} from './telemetry';
export type { SourcePatchEvent } from './telemetry';

import './telemetry';
