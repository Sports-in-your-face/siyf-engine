export { resolveFirst, resolveWithTrace, deepGet, pathKey } from './fieldResolver';
export type { FieldPath } from './fieldResolver';

export {
  CHRONO_POLL_INTERVALS,
  computeChronoPollInterval,
  computeGlobalChronoPollInterval,
  getChronoRecords,
  getGameChronoRecord,
  getRecentChronoTransitions,
  resetChronoState,
  subscribeChronoState,
  updateGameChrono,
  updateGamesChrono,
  type ChronoState,
  type ChronoTransition,
  type GameChronoRecord,
} from './chronoState';

export {
  classifyStatusSignal,
  hasActiveClock,
  loadCdnPauseKeywordsOverlay,
  resetCdnPauseKeywordsOverlay,
  type StatusSignal,
} from './statusClassifier';
export { initAdjusterCdn, refreshAdjusterCdn, stopAdjusterCdnPoll } from './adjusterCdnInit';

export {
  resolveEventField,
  resolveCompetitorField,
  resolveStatusState,
  resolveDisplayClock,
  getUpstreamAdapters,
} from '../acl';

export {
  recordFieldDlq,
  getDlqSnapshot,
  getDlqEntry,
  resetFieldDlq,
  shouldEmitDlqAlert,
  dlqToInvariantIssue,
  type FieldDlqEntry,
} from './dlq';

export { sniffField, CLOCK_RULE, type SniffRule, type SniffResult } from './valueSniffer';

export { fuzzyResolveField, type FuzzyMatch } from './fuzzyResolver';
export { resolveFieldWaterfall, type ResolveSource, type ResolveWaterfallResult } from './schemaResolver';
export {
  promoteToRegistry,
  getHotPathPaths,
  getHotPathStats,
  getHotPathEntries,
  resetHotPathRegistry,
  type HotPathEntry,
  type HotPathStats,
} from './hotPathRegistry';
export { mergeAliasPaths, loadCdnAliasOverlay, resetCdnAliasOverlay } from './cdnAliases';
export { shouldSkipScoreboardEnrichment } from './deltaFetch';

export {
  parseEventsWithHashGate,
  requestBypassHashGate,
  getHashGateStats,
  resetDeltaHashCache,
  hashRaw,
  hashEvent,
  type HashGateStats,
} from '../core/deltaHash';

export {
  dedupeRequest,
  getInFlightStats,
  coalesceKeyScoreboard,
  coalesceKeyGame,
  coalesceKeyEspnEvent,
  coalesceKeyFetchGames,
  type InFlightStats,
} from '../core/resilientFetch';

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
  type EspnResolveContext,
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
  type ParseDriftAlertKind,
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
