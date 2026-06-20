import type { EngineSport } from '../../sportConfig';
import { SPORT_ENDPOINTS, type SportType } from '../../../services/api';

export interface EndpointCandidate {
  id: string;
  url: string;
}

function swapEspnApiVersion(url: string, version: 'v2' | 'v3' | 'v1'): string | null {
  if (version === 'v2') return url;
  if (url.includes('/site/v2/')) return url.replace('/site/v2/', `/site/${version}/`);
  if (url.includes('/common/v3/')) return url.replace('/common/v3/', `/common/${version}/`);
  return null;
}

function withQuery(url: string, params: Record<string, string>): string {
  const sep = url.includes('?') ? '&' : '?';
  const q = new URLSearchParams(params).toString();
  return `${url}${sep}${q}`;
}

function todayEspnDates(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** Build ordered ESPN scoreboard URL candidates for a sport tab. */
export function espnScoreboardEndpointChain(
  sport: EngineSport | SportType,
  dates?: string,
): EndpointCandidate[] {
  const primary = SPORT_ENDPOINTS[sport as SportType];
  if (!primary) return [];

  const chainId = `espn-${String(sport).toLowerCase()}-scoreboard`;
  const dated = dates ?? todayEspnDates();
  const candidates: EndpointCandidate[] = [
    { id: `${chainId}:primary`, url: primary },
    { id: `${chainId}:dated`, url: withQuery(primary, { dates: dated }) },
    { id: `${chainId}:limit`, url: withQuery(primary, { limit: '300' }) },
    { id: `${chainId}:dated-limit`, url: withQuery(primary, { dates: dated, limit: '300' }) },
  ];

  const v3 = swapEspnApiVersion(primary, 'v3');
  if (v3) {
    candidates.push({ id: `${chainId}:v3`, url: v3 });
    candidates.push({ id: `${chainId}:v3-dated`, url: withQuery(v3, { dates: dated }) });
  }

  return dedupeCandidates(candidates);
}

export function espnScoreboardChainId(sport: EngineSport | SportType): string {
  return `espn-${String(sport).toLowerCase()}-scoreboard`;
}

/** Custom base path (soccer league, NBA base, etc.). */
export function espnCustomScoreboardChain(
  chainId: string,
  basePath: string,
  dates?: string,
): EndpointCandidate[] {
  const scoreboard = `${basePath}/scoreboard`;
  const dated = dates ?? todayEspnDates();
  const candidates: EndpointCandidate[] = [
    { id: `${chainId}:primary`, url: scoreboard },
    { id: `${chainId}:dated`, url: withQuery(scoreboard, { dates: dated }) },
    { id: `${chainId}:limit`, url: withQuery(scoreboard, { limit: '300' }) },
  ];

  const v3 = swapEspnApiVersion(scoreboard, 'v3');
  if (v3) candidates.push({ id: `${chainId}:v3`, url: v3 });

  return dedupeCandidates(candidates);
}

const YAHOO_SCOREBOARD_BASE =
  '/api/yahoo/v1/editorial/s/scoreboard'
  + '?lang=en-US&region=US&tz=America%2FLos_Angeles&ysp_redesign=1&season=current'
  + '&sched_states=current&v=2&ysp_enable_last_update=1&ssl=true';

export const YAHOO_SCOREBOARD_CHAIN_ID = 'yahoo-trending-scoreboard';

export function yahooScoreboardEndpointChain(): EndpointCandidate[] {
  return dedupeCandidates([
    {
      id: `${YAHOO_SCOREBOARD_CHAIN_ID}:extension`,
      url: `${YAHOO_SCOREBOARD_BASE}&trending=1&count=15&ysp_chrome_extension=1`,
    },
    {
      id: `${YAHOO_SCOREBOARD_CHAIN_ID}:trending-25`,
      url: `${YAHOO_SCOREBOARD_BASE}&trending=1&count=25`,
    },
    {
      id: `${YAHOO_SCOREBOARD_CHAIN_ID}:current`,
      url: `${YAHOO_SCOREBOARD_BASE}&count=25`,
    },
    {
      id: `${YAHOO_SCOREBOARD_CHAIN_ID}:all-states`,
      url: `${YAHOO_SCOREBOARD_BASE}&sched_states=current,final&count=25`,
    },
  ]);
}

function dedupeCandidates(candidates: EndpointCandidate[]): EndpointCandidate[] {
  const seen = new Set<string>();
  const out: EndpointCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    out.push(candidate);
  }
  return out;
}
