import type { EspnScoreboardPayload } from './espnEventTypes';
import type { StandingsGroup, StandingsRow } from './types';

interface EspnStatEntry {
  name?: string;
  type?: string;
  abbreviation?: string;
  displayValue?: string | number;
}

interface EspnStandingsEntry {
  athlete?: Record<string, unknown>;
  team?: Record<string, unknown>;
  stats?: EspnStatEntry[];
}

interface EspnStandingsChild {
  name?: string;
  abbreviation?: string;
  standings?: { entries?: EspnStandingsEntry[] };
  entries?: EspnStandingsEntry[];
}

function statVal(stats: EspnStatEntry[], ...names: string[]): string {
  for (const name of names) {
    const hit = stats.find(
      (s) => s.name === name || s.type === name || s.abbreviation === name,
    );
    if (hit?.displayValue != null) return String(hit.displayValue);
  }
  return '0';
}

function readAthleteField(athlete: Record<string, unknown>, key: string): string | undefined {
  const val = athlete[key];
  return typeof val === 'string' ? val : undefined;
}

function mapAthleteEntry(entry: EspnStandingsEntry, idx: number): StandingsRow {
  const athlete = (entry.athlete ?? entry.team ?? {}) as Record<string, unknown>;
  const stats = entry.stats ?? [];
  const headshot = athlete.headshot as { href?: string } | undefined;
  const flag = athlete.flag as { href?: string; alt?: string } | undefined;
  const logos = athlete.logos as Array<{ href?: string }> | undefined;
  const shortName = readAthleteField(athlete, 'shortName');

  return {
    rank: parseInt(statVal(stats, 'rank', 'position'), 10) || idx + 1,
    team: {
      id: String(athlete.id ?? idx),
      name: readAthleteField(athlete, 'displayName')
        ?? readAthleteField(athlete, 'fullName')
        ?? readAthleteField(athlete, 'name')
        ?? '—',
      abbr: readAthleteField(athlete, 'abbreviation')
        ?? shortName?.slice(0, 3)?.toUpperCase()
        ?? '—',
      city: readAthleteField(athlete, 'citizenship') ?? flag?.alt ?? '',
      logo: headshot?.href ?? flag?.href ?? logos?.[0]?.href ?? '',
    },
    wins: parseInt(statVal(stats, 'wins', 'eventsWon', 'tournamentWins'), 10) || 0,
    losses: parseInt(statVal(stats, 'losses', 'eventsLost'), 10) || 0,
    winPct: statVal(stats, 'winPercent', 'winPct', 'points', 'avgPoints', 'earnings') || '—',
    streak: statVal(stats, 'streak') || undefined,
    gamesBack: statVal(stats, 'pointsBehind', 'gamesBehind', 'pointsBack') || undefined,
  };
}

/** Parse ESPN standings payloads for individual sports (golf, tennis). */
export function parseEspnIndividualStandings(data: unknown, fallbackName: string): StandingsGroup[] {
  if (!data || typeof data !== 'object') return [];

  const raw = data as EspnScoreboardPayload & {
    children?: EspnStandingsChild[];
    standings?: { children?: EspnStandingsChild[]; entries?: EspnStandingsEntry[] };
    entries?: EspnStandingsEntry[];
  };
  const children = raw.children ?? raw.standings?.children;

  if (children?.length) {
    return children.map((conf) => ({
      name: conf.name ?? conf.abbreviation ?? fallbackName,
      rows: (conf.standings?.entries ?? conf.entries ?? []).map(mapAthleteEntry),
    })).filter((g) => g.rows.length);
  }

  const entries = raw.standings?.entries ?? raw.entries ?? [];
  if (!Array.isArray(entries) || !entries.length) return [];

  return [{ name: fallbackName, rows: entries.map(mapAthleteEntry) }];
}
