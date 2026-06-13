import { externalFetchUrl } from '../../config/siyfApi';
import { fetchJsonResilient } from '../core/resilientFetch';
import { cacheGet, cacheKey, cacheSet } from '../core/cache';
import type { StandingsGroup, StandingsRow } from '../core/types';
import { enrichTeam } from './teamRegistry';

interface TorvikTeam {
  team: string;
  conf?: string;
  record?: string;
  adjoe?: number;
  adjde?: number;
  barthag?: number;
  wins?: number;
  losses?: number;
}

function parseTorvikRecord(record?: string, wins?: number, losses?: number): { wins: number; losses: number; winPct: string } {
  if (typeof wins === 'number' && typeof losses === 'number') {
    const total = wins + losses;
    return { wins, losses, winPct: total ? (wins / total).toFixed(3).slice(1) : '.000' };
  }
  const match = record?.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return { wins: 0, losses: 0, winPct: '.000' };
  const w = parseInt(match[1], 10);
  const l = parseInt(match[2], 10);
  const total = w + l;
  return { wins: w, losses: l, winPct: total ? (w / total).toFixed(3).slice(1) : '.000' };
}

function mapTorvikToStandings(teams: TorvikTeam[]): StandingsGroup[] {
  const byConf = new Map<string, StandingsRow[]>();
  const sorted = [...teams].sort((a, b) => (b.barthag ?? 0) - (a.barthag ?? 0));

  sorted.forEach((t, idx) => {
    const conf = t.conf ?? 'Analytics';
    const abbr = t.team.slice(0, 4).toUpperCase();
    const reg = enrichTeam(abbr, { name: t.team });
    const rec = parseTorvikRecord(t.record, t.wins, t.losses);
    const row: StandingsRow = {
      rank: idx + 1,
      team: { ...reg, abbr: reg.abbr || abbr, name: t.team },
      wins: rec.wins,
      losses: rec.losses,
      winPct: rec.winPct,
      streak: t.barthag != null ? `Barthag ${t.barthag.toFixed(3)}` : undefined,
    };
    if (!byConf.has(conf)) byConf.set(conf, []);
    byConf.get(conf)!.push(row);
  });

  return Array.from(byConf.entries()).map(([name, rows]) => ({
    name: `${name} (Torvik)`,
    rows: rows.slice(0, 15),
  }));
}

export async function fetchBartTorvikStandings(): Promise<StandingsGroup[]> {
  const key = cacheKey('analytics', 'torvik');
  const cached = cacheGet<StandingsGroup[]>(key);
  if (cached?.length) return cached;

  const year = new Date().getFullYear();
  const urls = [
    `https://barttorvik.com/trank.json`,
    `https://barttorvik.com/${year}_team_results.json`,
  ];

  for (const url of urls) {
    const raw = await fetchJsonResilient<TorvikTeam[] | Record<string, TorvikTeam>>(
      externalFetchUrl(url),
      undefined,
      { label: 'barttorvik', retries: 1, timeout: 8_000 },
    );
    if (!raw) continue;
    const teams = Array.isArray(raw) ? raw : Object.values(raw);
    if (!teams.length) continue;
    const groups = mapTorvikToStandings(teams);
    if (groups.length) {
      cacheSet(key, groups, 3_600_000, 86_400_000);
      return groups;
    }
  }
  return [];
}
