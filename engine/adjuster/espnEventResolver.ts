import { resolveFirst, resolveWithTrace } from './fieldResolver';
import { ESPN_EVENT_ALIASES, type EspnEventField } from './registry';

export function resolveEspnEventField(event: unknown, field: EspnEventField): unknown {
  return resolveFirst(event, ESPN_EVENT_ALIASES[field]);
}

export function resolveEspnEventFieldWithTrace(
  event: unknown,
  field: EspnEventField,
): { value: unknown; path: string | null } {
  const { value, path } = resolveWithTrace(event, ESPN_EVENT_ALIASES[field]);
  return { value, path: path ? path.join('.') : null };
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
): unknown {
  return resolveEspnEventField(event, 'displayClock')
    ?? (competition ? resolveFirst(competition, ESPN_EVENT_ALIASES.displayClock) : undefined);
}
