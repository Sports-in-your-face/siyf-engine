import { getSportProfile } from '../../config/sportProfiles';
import type { Game, Player, StatItem, Team } from '../../types';
import { enrichGameWithTiming, extractEspnStartCandidates } from '../../utils/gameTime';
import { pickOrderedStats } from '../../config/sportProfiles';
import { coerceDisplayString, parseDisplayScore } from '../../utils/coerce';
import { resolveEspnCompetitorField } from '../../engine/adjuster/espnResolver';
import { resolveTennisAthleteAssets } from '../../utils/fighterAssets';
import { applyTennisContextToSubtitle, parseTennisGameContext } from './parseTennisContext';
import { ParseBatchAccumulator } from '../../engine/adjuster/recordParserBatch';

function parseAthleteCompetitor(comp: any, tour: 'ATP' | 'WTA'): Team {
  const athlete = comp.athlete ?? {};
  const { headshot, flag } = resolveTennisAthleteAssets(comp, tour);
  const record = comp.records?.[0]?.summary;
  const name = coerceDisplayString(resolveEspnCompetitorField(comp, 'teamName'), 'TBD');
  const abbr = athlete.flag?.abbreviation || athlete.shortName?.slice(0, 3)?.toUpperCase()
    || (name === 'TBD' ? 'TBD' : '—');

  return {
    name,
    abbr,
    score: parseDisplayScore(comp.score ?? comp.linescore?.score),
    logo: headshot,
    logoFallback: flag,
    flag,
    linescores: comp.linescores?.map((l: any) => parseDisplayScore(l.displayValue ?? l.value) ?? 0) as (number | string)[],
    record,
  };
}

function parseMatchStats(competition: any): { away: StatItem[]; home: StatItem[] } | undefined {
  const sorted = [...(competition.competitors ?? [])].sort(
    (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
  );
  if (sorted.length < 2) return undefined;

  const mapStats = (comp: any): StatItem[] =>
    (comp?.statistics ?? [])
      .filter((s: any) => s.displayValue !== undefined)
      .map((s: any) => ({
        label: s.abbreviation || s.name || s.displayName,
        value: s.displayValue,
      }))
      .slice(0, 10);

  const awayStats = mapStats(sorted[0]);
  const homeStats = mapStats(sorted[1]);
  if (!awayStats.length && !homeStats.length) return undefined;
  return { away: awayStats, home: homeStats };
}

function parseMatchLeaders(
  competition: any,
  profile: ReturnType<typeof getSportProfile>,
  tour: 'ATP' | 'WTA',
): Player[] {
  const players: Player[] = [];
  for (const comp of competition.competitors ?? []) {
    const athlete = comp.athlete ?? {};
    if (!athlete.displayName) continue;
    const stats: StatItem[] = (comp.statistics ?? [])
      .filter((s: any) => s.displayValue !== undefined)
      .map((s: any) => ({
        label: s.abbreviation || s.name || s.displayName,
        value: s.displayValue,
      }));
    if (!stats.length) continue;
    const { headshot, flag } = resolveTennisAthleteAssets(comp, tour);
    players.push({
      id: String(comp.id ?? athlete.id ?? athlete.displayName),
      name: athlete.displayName,
      team: athlete.flag?.abbreviation ?? '—',
      position: '—',
      headshot: headshot ?? flag,
      stats: pickOrderedStats(stats, profile.leaderStatOrder),
    });
  }
  return players;
}

function parseStatus(event: any, competition: any) {
  const profile = getSportProfile('TENNIS');
  const competitors = competition?.competitors ?? [];
  const tbdMatch = competitors.length >= 2 && competitors.every((c: any) => {
    const label = coerceDisplayString(c.athlete?.displayName ?? c.name, '');
    return !label || label === 'TBD';
  });
  const statusSource = competition?.status ?? (tbdMatch ? undefined : event.status);
  const state = (statusSource?.type?.state ?? (tbdMatch ? 'pre' : undefined)) as 'pre' | 'in' | 'post' | undefined;

  if (state === 'pre') {
    return { status: profile.scheduledLabel, statusState: 'pre' as const, clock: '—' };
  }
  if (state === 'post') {
    return {
      status: statusSource?.type?.shortDetail || profile.finalLabel,
      statusState: 'post' as const,
      clock: statusSource?.type?.detail || profile.finalLabel,
    };
  }
  return {
    status: statusSource?.type?.shortDetail || 'Live',
    statusState: 'in' as const,
    clock: statusSource?.displayClock || statusSource?.type?.detail || '—',
  };
}

export function parseTennisEvents(events: any[], tour = 'ATP'): Game[] {
  const profile = getSportProfile('TENNIS');
  const games: Game[] = [];
  const batch = new ParseBatchAccumulator();

  for (const event of events) {
    const tournamentName = event.name ?? event.shortName;
    const venue = event.venue?.displayName;

    for (const grouping of event.groupings ?? []) {
      for (const competition of grouping.competitions ?? []) {
        batch.rawCount += 1;
        try {
          const competitors = competition.competitors ?? [];
          if (competitors.length < 2) {
            batch.skipped += 1;
            continue;
          }

          const sorted = [...competitors].sort(
            (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
          );

          const { status, statusState, clock } = parseStatus(event, competition);
          const timingResult = enrichGameWithTiming(
            { statusState, clock },
            extractEspnStartCandidates(event, competition),
          );

          const round = competition.round?.displayName;
          const draw = grouping.grouping?.displayName;
          const surface = competition.surface?.displayName ?? competition.surface?.abbreviation;
          const broadcast = competition.broadcasts?.[0]?.names?.join(', ')
            ?? competition.broadcast
            ?? event.broadcasts?.[0]?.names?.join(', ');

          const context = parseTennisGameContext(tournamentName, round, surface, broadcast, statusState);
          const rawSubtitle = [tournamentName, round, draw !== 'Men\'s Singles' && draw !== 'Women\'s Singles' ? draw : null, venue]
            .filter(Boolean)
            .join(' · ');
          const subtitle = applyTennisContextToSubtitle(context, rawSubtitle);

          const tourCode = tour as 'ATP' | 'WTA';
          const topPerformers = profile.showPerformers
            ? parseMatchLeaders(competition, profile, tourCode)
            : undefined;

          games.push({
            id: `${event.id}-${competition.id}`,
            sport: tour,
            status,
            statusState,
            clock: timingResult.clock,
            timing: timingResult.timing,
            away: parseAthleteCompetitor(sorted[0], tourCode),
            home: parseAthleteCompetitor(sorted[1], tourCode),
            subtitle,
            tournamentName,
            round,
            surface,
            teamStats: parseMatchStats(competition),
            topPerformers: topPerformers?.length ? topPerformers : undefined,
            venue,
            broadcast,
            context,
          });
        } catch {
          batch.skipped += 1;
        }
      }
    }
  }

  batch.finish('TENNIS', games);
  return games;
}
