/** Browser sessionStorage cache for non-live data (teams, standings, rosters). */

const PREFIX = 'siyf:';

interface SessionEntry<T> {
  v: T;
  t: number;
}

export function sessionGet<T>(key: string, maxAgeMs: number): T | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SessionEntry<T>;
    if (Date.now() - parsed.t > maxAgeMs) {
      sessionStorage.removeItem(PREFIX + key);
      return undefined;
    }
    return parsed.v;
  } catch {
    return undefined;
  }
}

export function sessionSet(key: string, value: unknown): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const entry: SessionEntry<unknown> = { v: value, t: Date.now() };
    sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function sessionDelete(key: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
