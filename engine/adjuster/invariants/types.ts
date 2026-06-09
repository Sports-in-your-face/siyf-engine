export type InvariantSeverity = 'error' | 'warn';

export interface ParseInvariantIssue {
  code: string;
  message: string;
  severity: InvariantSeverity;
  field?: string;
  gameId?: string;
}
