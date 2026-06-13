function readApiBase(): string {
  const fromProcess = typeof process !== 'undefined' ? process.env.SIYF_API_URL : undefined;
  const fromVite = typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_SIYF_API_URL
    : undefined;
  return fromProcess ?? fromVite ?? 'https://siyf-web-api.nic-58f.workers.dev';
}

export const SIYF_API_BASE = readApiBase();

export function siyfApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SIYF_API_BASE}${normalized}`;
}

/**
 * Resolve worker-proxied paths for the Chrome extension.
 * Every /api/* call goes to SIYF-API (ESPN, odds, BDL, RSS) so all users share edge cache.
 * Paid routes (BDL, SPORTS, ODDS, SGO) are only hit from engine last-resort fallbacks — see paidApiPolicy.ts.
 */
export function resolveProxyUrl(url: string): string {
  if (!url.startsWith('/api/')) return url;
  return siyfApiUrl(url);
}

/** Route browser-blocked external URLs through SIYF-API. */
export function externalFetchUrl(url: string): string {
  if (url.startsWith('/') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
    return siyfApiUrl(`/api/fetch?url=${encodeURIComponent(url)}`);
  } catch {
    return url;
  }
}
