/** Article-style RSS / SEO headlines that should never appear on scoreboards or game detail. */
export function isScoreboardNoiseText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();

  if (/where to watch|how to watch|live stream|start time|tv channel|watch live|odds for|streaming options/i.test(lower)) {
    return true;
  }
  if (/^o\/u \d/i.test(lower)) return true;
  if (/power rankings|mock draft|weekly (?:recap|wrap)|rankings:|fantasy baseball|fantasy football|fantasy basketball|fantasy hockey|fantasy golf|fantasy tennis|fantasy mma|fantasy boxing/i.test(lower)) {
    return true;
  }
  if (trimmed.length > 100 && /\bvs\.?\b/i.test(trimmed)) {
    return true;
  }

  return false;
}

/** Safe uppercase label for context badges derived from RSS/headline text. */
export function contextLabelFromHeadline(headline: string, maxLen = 40): string | undefined {
  const trimmed = headline.trim();
  if (!trimmed || isScoreboardNoiseText(trimmed)) return undefined;
  const label = trimmed.replace(/\s*-\s*/g, ' · ').toUpperCase().slice(0, maxLen);
  return label || undefined;
}
