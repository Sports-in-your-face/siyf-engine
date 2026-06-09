import type { SportType } from '../../../services/api';
import type { EngineSport } from '../../sportConfig';
import type { ParseBatchReport } from '../adjuster';

export type SourceKind = 'espn' | 'action-network' | 'supplemental' | 'merge' | 'aggregate';

export type SourceSmokeStatus = 'ok' | 'skipped' | 'fetch_failed';

export interface SourceParseResult {
  games: import('../../../types').Game[];
  rawCount: number;
  skipped: number;
}

export interface SourceSmokeDefinition {
  id: string;
  kind: SourceKind;
  sport: string;
  label: string;
  endpoint: string;
  /** When true, empty payloads are a soft skip (off-season / pre-scheduled). */
  allowEmpty?: boolean;
  /** Golf-style: pre event with no competitor field yet. */
  allowScheduledEmpty?: boolean;
}

export interface SourceSmokeResult {
  id: string;
  kind: SourceKind;
  sport: string;
  label: string;
  status: SourceSmokeStatus;
  reason?: string;
  endpoint: string;
  report?: ParseBatchReport;
  mergeIssues?: import('../invariants/types').ParseInvariantIssue[];
}

export interface MergeSmokeDefinition {
  id: string;
  sport: EngineSport;
  label: string;
  espnEndpoint: string;
  anLeague: string;
}

export interface AggregateSmokeDefinition {
  id: string;
  sport: string;
  label: string;
  kind: 'aggregate';
}

export type EspnSmokeSport = SportType;
