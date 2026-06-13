import { resolveFieldWaterfall } from './schemaResolver';
import { ESPN_COMPETITOR_ALIASES, type EspnCompetitorField } from './registry';

export function resolveEspnCompetitorField(comp: unknown, field: EspnCompetitorField): unknown {
  return resolveFieldWaterfall(comp, ESPN_COMPETITOR_ALIASES[field], {
    canonicalField: field,
    fuzzyParent: comp,
  }).value;
}

export function resolveEspnCompetitorFieldWithTrace(
  comp: unknown,
  field: EspnCompetitorField,
): { value: unknown; path: string | null; source: string } {
  const result = resolveFieldWaterfall(comp, ESPN_COMPETITOR_ALIASES[field], {
    canonicalField: field,
    fuzzyParent: comp,
  });
  return {
    value: result.value,
    path: result.pathKey,
    source: result.source,
  };
}
