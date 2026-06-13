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
 * Appwrite JWT for the current user session.
 * Set by useAuth after login; cleared on logout.
 * Attached to paid-API proxy calls so the server can verify premium membership.
 */
let _siyfAuthJwt: string | null = null;

export function setSiyfAuthJwt(jwt: string | null): void {
  _siyfAuthJwt = jwt;
}

export function getSiyfAuthJwt(): string | null {
  return _siyfAuthJwt;
}

/** Whether the engine currently has a premium-user JWT loaded. */
export function isSiyfPremium(): boolean {
  return Boolean(_siyfAuthJwt);
}

/**
 * Resolve worker-proxied paths for the Chrome extension.
 * Every /api/* call goes to SIYF-API (ESPN, odds, BDL, RSS) so all users share edge cache.
 * Paid routes (BDL, SPORTS, ODDS, SGO) are only hit from engine last-resort fallbacks — see paidApiPolicy.ts.
 */
export function resolveProxyUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (!url.startsWith('/api/')) return url;
  return siyfApiUrl(url);
}

/** Route browser-blocked external URLs through SIYF-API. */
export function externalFetchUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.startsWith('/') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
    return siyfApiUrl(`/api/fetch?url=${encodeURIComponent(url)}`);
  } catch {
    return url;
  }
}
