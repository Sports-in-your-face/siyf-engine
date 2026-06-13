export type {
  AclResolveContext,
  CanonicalCompetitorField,
  CanonicalEventField,
  FieldResolveResult,
  UpstreamAdapter,
  UpstreamProviderId,
} from './types';
export { AN_FALLBACK_EVENT_FIELDS } from './types';

export { espnAdapter } from './adapters/espn';
export { actionNetworkAdapter, isActionNetworkGame } from './adapters/actionNetwork';

export {
  getAdapter,
  getUpstreamAdapters,
  resolveCompetitorField,
  resolveCompetitorFieldWithTrace,
  resolveDisplayClock,
  resolveEventField,
  resolveEventFieldWithTrace,
  resolveStatusState,
} from './router';

export {
  BUNDLED_ADJUSTER_SCHEMA_VERSION,
  checkAdjusterSchemaVersion,
  getAdjusterSchemaStatus,
  loadAdjusterSchemaFromCdn,
  resetAdjusterSchemaStatus,
  type AdjusterSchemaFile,
  type AdjusterSchemaStatus,
} from './schemaVersion';
