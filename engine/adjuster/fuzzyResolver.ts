/**
 * Parent-scoped Levenshtein key matching for upstream schema drift.
 * Only walks one object level — never hallucinates across the full tree.
 */

export interface FuzzyMatch {
  key: string;
  path: string;
  value: unknown;
  distance: number;
  score: number;
}

const FIELD_SYNONYMS: Record<string, readonly string[]> = {
  score: ['score', 'scoring', 'points', 'curscore', 'displayvalue', 'value'],
  displayClock: ['displayclock', 'clock', 'remaining', 'time', 'detail'],
  teamName: ['displayname', 'name', 'shortdisplayname', 'teamname'],
  teamAbbr: ['abbreviation', 'abbr', 'shortname'],
  teamId: ['id', 'teamid', 'athleteid'],
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[] = new Array(rows * cols);

  for (let i = 0; i < rows; i++) matrix[i * cols] = i;
  for (let j = 0; j < cols; j++) matrix[j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const idx = i * cols + j;
      matrix[idx] = Math.min(
        matrix[(i - 1) * cols + j] + 1,
        matrix[i * cols + (j - 1)] + 1,
        matrix[(i - 1) * cols + (j - 1)] + cost,
      );
    }
  }

  return matrix[rows * cols - 1];
}

function maxDistanceFor(key: string): number {
  if (key.length <= 4) return 1;
  if (key.length <= 8) return 2;
  return 3;
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function candidateTargets(canonicalField: string): string[] {
  const synonyms = FIELD_SYNONYMS[canonicalField] ?? [canonicalField];
  return [...new Set(synonyms.map(normalizeKey))];
}

function scoreCandidate(distance: number, maxDist: number, depth: number): number {
  return Math.max(0, 10 - distance * 3 - depth);
}

function collectFromObject(
  node: Record<string, unknown>,
  basePath: string,
  targets: string[],
  depth: number,
  out: FuzzyMatch[],
): void {
  if (depth > 2) return;

  for (const [key, value] of Object.entries(node)) {
    const norm = normalizeKey(key);
    const path = basePath ? `${basePath}.${key}` : key;

    for (const target of targets) {
      const dist = levenshtein(norm, target);
      const maxDist = maxDistanceFor(target);
      if (dist <= maxDist) {
        if (value !== undefined && value !== null && typeof value !== 'object') {
          out.push({
            key,
            path,
            value,
            distance: dist,
            score: scoreCandidate(dist, maxDist, depth),
          });
        } else if (value != null && typeof value === 'object' && !Array.isArray(value)) {
          for (const [childKey, childVal] of Object.entries(value as Record<string, unknown>)) {
            const childNorm = normalizeKey(childKey);
            for (const childTarget of ['displayvalue', 'value', 'score']) {
              const childDist = levenshtein(childNorm, childTarget);
              if (childDist <= maxDistanceFor(childTarget) && childVal !== undefined && childVal !== null && typeof childVal !== 'object') {
                out.push({
                  key: `${key}.${childKey}`,
                  path: `${path}.${childKey}`,
                  value: childVal,
                  distance: childDist + dist,
                  score: scoreCandidate(childDist + dist, maxDist + 1, depth + 1),
                });
              }
            }
          }
        }
      }
    }

    if (value != null && typeof value === 'object' && !Array.isArray(value) && depth < 2) {
      collectFromObject(value as Record<string, unknown>, path, targets, depth + 1, out);
    }
  }
}

/** Fuzzy-match a canonical field within a parent object (competitor, event status, etc.). */
export function fuzzyResolveField(
  parent: unknown,
  canonicalField: string,
): FuzzyMatch | null {
  if (parent == null || typeof parent !== 'object' || Array.isArray(parent)) return null;

  const targets = candidateTargets(canonicalField);
  const candidates: FuzzyMatch[] = [];
  collectFromObject(parent as Record<string, unknown>, '', targets, 0, candidates);

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);
  return candidates[0] ?? null;
}
