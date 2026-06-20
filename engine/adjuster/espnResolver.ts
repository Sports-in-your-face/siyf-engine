import { resolveFirst, resolveWithTrace } from './fieldResolver';
import { ESPN_COMPETITOR_ALIASES, type EspnCompetitorField } from './registry';

export function resolveEspnCompetitorField(comp: unknown, field: EspnCompetitorField): unknown {
  return resolveFirst(comp, ESPN_COMPETITOR_ALIASES[field]);
}

export function resolveEspnCompetitorFieldWithTrace(
  comp: unknown,
  field: EspnCompetitorField,
): { value: unknown; path: string | null } {
  const { value, path } = resolveWithTrace(comp, ESPN_COMPETITOR_ALIASES[field]);
  return { value, path: path ? path.join('.') : null };
}
