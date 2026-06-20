export { resolveFirst, resolveWithTrace, deepGet, pathKey } from './fieldResolver';
export type { FieldPath } from './fieldResolver';

export { ESPN_COMPETITOR_ALIASES, ESPN_EVENT_ALIASES } from './registry';
export type { EspnCompetitorField } from './registry';

export {
  resolveEspnCompetitorField,
  resolveEspnCompetitorFieldWithTrace,
} from './espnResolver';

export {
  resolveEspnEventField,
  resolveEspnEventFieldWithTrace,
  resolveEspnStatusState,
  resolveEspnDisplayClock,
} from './espnEventResolver';

export {
  finishParserBatch,
  ParseBatchAccumulator,
  type ParserBatchStats,
} from './recordParserBatch';

export {
  validateGame,
  validateGames,
  validateGameForSport,
  resolveLayoutForGame,
  hasBlockingIssues,
  type ParseInvariantIssue,
  type InvariantSeverity,
} from './invariants';

export {
  recordParseBatch,
  auditParsedGame,
  buildDriftReport,
  type ParseBatchInput,
  type ParseBatchReport,
} from './adjuster';

export {
  getSportParseThreshold,
  SPORT_PARSE_THRESHOLDS,
  type SportParseThresholds,
} from './metrics';

export {
  getParseBatchHistory,
  getParseDriftAlerts,
  resetParseTelemetry,
  PARSE_RATE_WARN_THRESHOLD,
  PARSE_RATE_ERROR_THRESHOLD,
  type ParseBatchMetrics,
  type ParseDriftAlert,
} from './telemetry';

export {
  canUsePaidApi,
  trackPaidApiHourly,
  recordPaidApiGatePass,
  resetPaidKillSwitch,
  PAID_API_LIMITS,
  PAID_API_DAILY_LIMIT,
  type PaidApiGateResult,
  type PaidApiLimit,
} from './paidKillSwitch';

export {
  fetchWithSelfPatch,
  espnScoreboardEndpointChain,
  yahooScoreboardEndpointChain,
  probeEspnScoreboard,
  probeYahooScoreboard,
  extractEspnEventsFromRaw,
  extractYahooScoreboardRoot,
  getSourcePatchHistory,
  resetSourcePatchTelemetry,
  getPatchStoreSnapshot,
  resetPatchStore,
} from './sourcePatch';
export type { SourcePatchEvent, SelfPatchFetchResult, EndpointCandidate } from './sourcePatch';

import './sourcePatch';
import './telemetry';

export {
  CHAOS_SCENARIOS,
  runChaosScenario,
  runAllChaosScenarios,
  summarizeSimulations,
  cloneFixture,
  wrapInObject,
  moveField,
  type ChaosScenario,
  type SimulationResult,
} from './simulator';
