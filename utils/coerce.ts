/** Coerce ESPN/API values to display-safe strings. */
export function coerceDisplayString(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['displayValue', 'displayName', 'shortDisplayName', 'name', 'text', 'value', 'summary']) {
      const inner = obj[key];
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
      if (typeof inner === 'number') return String(inner);
    }
  }
  return fallback;
}

/** Normalize score fields from ESPN JSON (number, string, or { displayValue }). */
export function parseDisplayScore(value: unknown): number | string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = parseInt(trimmed, 10);
    if (!Number.isNaN(num) && String(num) === trimmed) return num;
    return trimmed;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.value !== undefined) return parseDisplayScore(obj.value);
    if (obj.displayValue !== undefined) return parseDisplayScore(obj.displayValue);
  }
  return null;
}

export function isWnbaGame(game: { sport?: string }): boolean {
  return (game.sport ?? '').toUpperCase() === 'WNBA';
}

export function isNcaaGame(game: { sport?: string }): boolean {
  return (game.sport ?? '').toUpperCase() === 'NCAA';
}

/** Only NBA core games should use the NBA CDN team registry. */
export function shouldUseNbaTeamCdn(game: { sport?: string }): boolean {
  const s = (game.sport ?? '').toUpperCase();
  return !s || s === 'NBA' || s === 'BASKETBALL';
}

/** Numeric score for cache/compare logic — unwraps ESPN object scores. */
export function scoreToNumber(value: unknown, fallback = 0): number {
  const parsed = parseDisplayScore(value);
  if (parsed === null || parsed === '') return fallback;
  const n = typeof parsed === 'number' ? parsed : parseInt(String(parsed), 10);
  return Number.isNaN(n) ? fallback : n;
}

export function scoreIsEmpty(value: unknown): boolean {
  const parsed = parseDisplayScore(value);
  return parsed == null || parsed === '';
}
