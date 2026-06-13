/**
 * Context-bounded value sniffing for upstream schema drift.
 * Regex alone is volatile — key names and sibling proximity gate matches.
 */

export interface SniffRule {
  canonicalField: string;
  valuePattern: RegExp;
  /** Key must contain one of these substrings (case-insensitive). */
  keyHints?: readonly string[];
  /** Reject keys containing any of these substrings. */
  keyReject?: readonly string[];
}

export interface SniffCandidate {
  key: string;
  value: unknown;
  path: string;
  score: number;
}

export interface SniffResult {
  value: unknown;
  candidate: SniffCandidate | null;
}

const DEFAULT_KEY_HINTS = ['time', 'display', 'clock', 'remaining', 'period', 'quarter'] as const;
const DEFAULT_KEY_REJECT = ['possession', 'penalty', 'timeout', 'commercial'] as const;

const CLOCK_RULE: SniffRule = {
  canonicalField: 'displayClock',
  valuePattern: /^[0-5]?\d:[0-5]\d$/,
  keyHints: DEFAULT_KEY_HINTS,
  keyReject: DEFAULT_KEY_REJECT,
};

function keyPasses(key: string, rule: SniffRule): boolean {
  const lower = key.toLowerCase();
  if (rule.keyReject?.some((r) => lower.includes(r))) return false;
  if (!rule.keyHints?.length) return true;
  return rule.keyHints.some((h) => lower.includes(h));
}

function walkObject(
  node: unknown,
  path: string,
  rule: SniffRule,
  out: SniffCandidate[],
  depth: number,
): void {
  if (depth > 6 || node == null || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      walkObject(node[i], `${path}[${i}]`, rule, out, depth + 1);
    }
    return;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;

    if (typeof value === 'string' && rule.valuePattern.test(value.trim()) && keyPasses(key, rule)) {
      out.push({
        key,
        value,
        path: childPath,
        score: 10 + (rule.keyHints?.filter((h) => key.toLowerCase().includes(h)).length ?? 0),
      });
    }

    if (value != null && typeof value === 'object') {
      walkObject(value, childPath, rule, out, depth + 1);
    }
  }
}

/** Sniff a bounded field from raw upstream JSON. */
export function sniffField(root: unknown, rule: SniffRule = CLOCK_RULE): SniffResult {
  const candidates: SniffCandidate[] = [];
  walkObject(root, '', rule, candidates, 0);
  if (!candidates.length) return { value: undefined, candidate: null };

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return { value: best.value, candidate: best };
}

export { CLOCK_RULE };
