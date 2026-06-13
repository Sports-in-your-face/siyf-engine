import { resolveFirst, type FieldPath } from './fieldResolver';
import { resolveFieldWaterfall } from './schemaResolver';
import { ESPN_EVENT_ALIASES, type EspnEventField } from './registry';
import { recordFieldDlq, shouldEmitDlqAlert } from './dlq';
import { recordDriftAlert } from './telemetry';

export interface EspnResolveContext {
  sport?: string;
  gameId?: string;
}

export function resolveEspnEventField(event: unknown, field: EspnEventField): unknown {
  return resolveFirst(event, ESPN_EVENT_ALIASES[field]);
}

export function resolveEspnEventFieldWithTrace(
  event: unknown,
  field: EspnEventField,
): { value: unknown; path: string | null; source: string } {
  const result = resolveFieldWaterfall(event, ESPN_EVENT_ALIASES[field], {
    canonicalField: field,
    sniffRoot: event,
    fuzzyParent: event,
    enableFuzzy: false,
  });
  return {
    value: result.value,
    path: result.pathKey,
    source: result.source,
  };
}

/** Status lives on event or competition — try both with registry paths. */
export function resolveEspnStatusState(
  event: unknown,
  competition?: unknown,
): 'pre' | 'in' | 'post' | undefined {
  const raw = resolveEspnEventField(event, 'statusState')
    ?? (competition ? resolveFirst(competition, ESPN_EVENT_ALIASES.statusState) : undefined);
  if (raw === 'pre' || raw === 'in' || raw === 'post') return raw;
  return undefined;
}

export function resolveEspnDisplayClock(
  event: unknown,
  competition?: unknown,
  ctx?: EspnResolveContext,
): unknown {
  const sniffRoot = competition ?? event;
  const result = resolveFieldWaterfall(event, ESPN_EVENT_ALIASES.displayClock, {
    canonicalField: 'displayClock',
    sniffRoot,
    enableFuzzy: false,
  });

  if (result.value !== undefined && result.value !== null) return result.value;

  const compResult = competition
    ? resolveFieldWaterfall(competition, ESPN_EVENT_ALIASES.displayClock, {
        canonicalField: 'displayClock',
        sniffRoot: competition,
        enableFuzzy: false,
      })
    : null;

  if (compResult?.value !== undefined && compResult?.value !== null) return compResult.value;

  if (ctx?.sport) {
    const attempted: FieldPath[] = [...ESPN_EVENT_ALIASES.displayClock];
    const entry = recordFieldDlq({
      sport: ctx.sport,
      gameId: ctx.gameId,
      canonicalField: 'displayClock',
      attemptedPaths: attempted.map((p) => p.join('.')),
    });
    if (shouldEmitDlqAlert(entry.dedupeKey)) {
      recordDriftAlert({
        sport: ctx.sport,
        kind: 'field_mapping_failed',
        message: `displayClock unresolved for game ${ctx.gameId ?? 'unknown'}`,
        metrics: {
          sport: ctx.sport,
          rawCount: 1,
          parsedCount: 0,
          skippedCount: 1,
          issueCount: 1,
          errorCount: 0,
          parseRate: 0,
          timestamp: Date.now(),
        },
        topIssues: [{
          code: 'field_mapping_failed',
          severity: 'warn',
          message: entry.canonicalField,
          field: 'displayClock',
          gameId: ctx.gameId,
        }],
      });
    }
  }

  return undefined;
}
