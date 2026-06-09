import { cacheKey, cachedFetch } from '../core/cache';
import { profileForResource } from '../core/cacheTiers';
import { fetchJsonResilient } from '../core/resilientFetch';
import type { Game } from '../../types';
import { enrichTeam, resolveTeamLogo } from './teamRegistry';
import { enrichGameWithTiming, extractBdlStartCandidate } from '../../utils/gameTime';

import { siyfApiUrl } from '../../config/siyfApi';

const PROXY_BASE = siyfApiUrl('/api/bdl');

function parseBdlStatus(status: string): {
  status: string;
  statusState: 'pre' | 'in' | 'post';
  clock: string;
} {
  const s = status?.trim() ?? '';
  if (s === 'Final' || s.startsWith('Final')) {
    return { status: 'Final', statusState: 'post', clock: 'Final' };
  }
  if (/Qtr|Half|OT|End of/.test(s)) {
    return { status: s, statusState: 'in', clock: s };
  }
  return { status: s || 'Scheduled', statusState: 'pre', clock: '—' };
}

export function mapBdlGames(raw: any[]): Game[] {
  return raw.map((g) => {
    const parsed = parseBdlStatus(g.status);
    const awayReg = enrichTeam(g.visitor_team.abbreviation, { name: g.visitor_team.full_name });
    const homeReg = enrichTeam(g.home_team.abbreviation, { name: g.home_team.full_name });

    const base: Game = {
      id: String(g.id),
      status: parsed.status,
      statusState: parsed.statusState,
      clock:
        g.time && parsed.statusState === 'in'
          ? `${parsed.status} ${g.time}`.trim()
          : parsed.clock,
      away: {
        name: awayReg.name || g.visitor_team.full_name,
        abbr: awayReg.abbr,
        score: g.visitor_team_score ?? null,
        logo: resolveTeamLogo(awayReg.abbr, awayReg.logo),
        color: awayReg.color,
        alternateColor: awayReg.alternateColor,
      },
      home: {
        name: homeReg.name || g.home_team.full_name,
        abbr: homeReg.abbr,
        score: g.home_team_score ?? null,
        logo: resolveTeamLogo(homeReg.abbr, homeReg.logo),
        color: homeReg.color,
        alternateColor: homeReg.alternateColor,
      },
    };

    if (g.date) {
      const candidate = extractBdlStartCandidate(g.date);
      if (candidate) {
        const { timing, clock } = enrichGameWithTiming(base, [candidate]);
        return { ...base, timing, clock };
      }
    }

    return base;
  });
}

export async function bdlGames(dates: string): Promise<any | null> {
  const key = cacheKey('bdl', 'games', dates);
  return cachedFetch(
    key,
    profileForResource('scoreboard'),
    ({ bypassCache }) =>
      fetchJsonResilient(
        `${PROXY_BASE}/games?dates[]=${dates}&per_page=100`,
        undefined,
        { label: 'bdl-games', retries: 0, bypassCache },
      ),
    ['scoreboard', 'bdl'],
  );
}

