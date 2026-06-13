import { getSportProfile } from '../../config/sportProfiles';
import type { Game, LeaderboardEntry, Team } from '../../types';
import { enrichGameWithTiming, extractEspnStartCandidates } from '../../utils/gameTime';
import { parseGolfGameContext } from './parseGolfContext';
import { ParseBatchAccumulator } from '../../engine/adjuster/recordParserBatch';

function parseScore(value: unknown): number | string | null {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value);
  const num = parseInt(str, 10);
  if (!Number.isNaN(num) && String(num) === str.trim()) return num;
  return str;
}

function getLogo(entity: any): string | undefined {
  if (entity?.flag?.href) return entity.flag.href;
  if (entity?.headshot?.href) return entity.headshot.href;
  if (entity?.headshot && typeof entity.headshot === 'string') return entity.headshot;
  return undefined;
}

function parseToPar(comp: any): string {
  const stat = (comp.statistics ?? []).find((s: any) => {
    const name = String(s.name ?? s.abbreviation ?? s.displayName ?? '').toLowerCase();
    return name.includes('par') || name === 'score' || name === 'tot';
  })?.displayValue;
  if (stat != null && stat !== '') return String(stat);

  const score = comp.score;
  if (score == null || score === '') return '—';
  const str = String(score).trim();
  if (/^[+-]?\d+$/.test(str)) {
    const n = parseInt(str, 10);
    return n > 0 ? `+${n}` : str;
  }
  return str;
}

function parseTotalStrokes(comp: any): string {
  const rounds = (comp.linescores ?? []).filter((l: any) => l.period && l.period <= 4);
  const roundValues = rounds
    .map((l: any) => parseInt(String(l.displayValue ?? l.value ?? ''), 10))
    .filter((n: number) => !Number.isNaN(n) && n > 50);
  if (roundValues.length) return String(roundValues.reduce((a: number, b: number) => a + b, 0));

  const score = comp.score;
  if (score != null && parseInt(String(score), 10) > 50) return String(score);
  return String(score ?? '—');
}

function deriveThru(comp: any): string | undefined {
  const rounds = (comp.linescores ?? []).filter((l: any) => l.period && l.period <= 4);
  if (!rounds.length) return undefined;
  const last = rounds[rounds.length - 1];
  const holes = last.linescores?.length;
  if (holes && holes < 18) return String(holes);
  if (last.displayValue && last.displayValue !== '—') return 'F';
  return undefined;
}

export function parseGolfCompetitor(comp: any): LeaderboardEntry {
  const athlete = comp.athlete ?? {};
  const rounds = (comp.linescores ?? [])
    .filter((l: any) => l.period && l.period <= 4)
    .map((l: any) => l.displayValue ?? parseScore(l.value) ?? '—');

  const toPar = parseToPar(comp);
  return {
    id: String(comp.id ?? athlete.id ?? athlete.displayName),
    name: athlete.displayName ?? athlete.shortName ?? 'TBD',
    position: comp.order ?? 0,
    score: parseTotalStrokes(comp),
    toPar,
    thru: comp.status?.displayValue || deriveThru(comp),
    logo: getLogo(athlete),
    country: athlete.flag?.alt ?? athlete.citizenship,
    linescores: rounds,
  };
}

function parseStatus(event: any) {
  const profile = getSportProfile('GOLF');
  const state = event.status?.type?.state as 'pre' | 'in' | 'post' | undefined;

  if (state === 'pre') {
    return { status: profile.scheduledLabel, statusState: 'pre' as const, clock: '—' };
  }
  if (state === 'post') {
    return {
      status: event.status?.type?.shortDetail || profile.finalLabel,
      statusState: 'post' as const,
      clock: event.status?.type?.detail || profile.finalLabel,
    };
  }
  return {
    status: event.status?.type?.shortDetail || 'Live',
    statusState: 'in' as const,
    clock: event.status?.displayClock || event.status?.type?.detail || '—',
  };
}

function entryToTeam(entry: LeaderboardEntry): Team {
  return {
    name: entry.name,
    abbr: entry.country?.slice(0, 3).toUpperCase() || '—',
    score: entry.toPar ?? entry.score,
    logo: entry.logo,
    linescores: entry.linescores,
    record: entry.position ? `T${entry.position}` : undefined,
  };
}

export function parseGolfEvents(events: any[], tour = 'PGA'): Game[] {
  const games: Game[] = [];
  const batch = new ParseBatchAccumulator();

  for (const event of events) {
    batch.rawCount += 1;
    try {
      const competition = event.competitions?.[0]
        ?? (Array.isArray(event.competitors) && event.competitors.length
          ? { competitors: event.competitors, status: event.status }
          : null);
      if (!competition?.competitors?.length) {
        batch.skipped += 1;
        continue;
      }

      const leaderboard = [...competition.competitors]
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
        .map(parseGolfCompetitor);

      const leader = leaderboard[0];
      const second = leaderboard[1];
      if (!leader) {
        batch.skipped += 1;
        continue;
      }

      const { status, statusState, clock } = parseStatus(event);
      const timingResult = enrichGameWithTiming(
        { statusState, clock },
        extractEspnStartCandidates(event, competition),
      );

      const venue = event.venue?.displayName ?? event.courses?.[0]?.name;
      const tournamentName = event.name ?? event.shortName;
      const broadcast = event.broadcasts?.[0]?.names?.join(', ') ?? competition.broadcasts?.[0]?.names?.join(', ');
      const context = parseGolfGameContext(tournamentName, broadcast, statusState);
      const subtitle = context?.headline ?? [tournamentName, venue].filter(Boolean).join(' · ');

      games.push({
        id: String(event.id),
        sport: tour,
        status,
        statusState,
        clock: timingResult.clock,
        timing: timingResult.timing,
        away: entryToTeam(leader),
        home: second ? entryToTeam(second) : { name: 'Field', abbr: 'FLD', score: null },
        leaderboard,
        tournamentName,
        subtitle,
        venue,
        broadcast,
        context,
      });
    } catch {
      batch.skipped += 1;
    }
  }

  batch.finish('GOLF', games);
  return games;
}
