import { getSportProfile } from '../../config/sportProfiles';
import type { Game, Player, StatItem, Team } from '../../types';
import { enrichGameWithTiming, extractEspnStartCandidates } from '../../utils/gameTime';
import { pickOrderedStats } from '../../config/sportProfiles';
import { parseDisplayScore } from '../../utils/coerce';
import { resolveMmaFighterAssets } from '../../utils/fighterAssets';
import { ParseBatchAccumulator } from '../../engine/adjuster/recordParserBatch';

function parseFighter(comp: any, statusState?: string): Team {
  const athlete = comp.athlete ?? {};
  const { headshot, flag } = resolveMmaFighterAssets(comp);
  const record = comp.records?.[0]?.summary;
  let score: string | number | null = parseDisplayScore(comp.score);
  if (statusState === 'post') {
    score = comp.winner ? 'W' : 'L';
  }
  return {
    name: athlete.displayName || athlete.shortName || 'TBD',
    abbr: athlete.flag?.abbreviation || athlete.shortName?.slice(0, 3)?.toUpperCase() || '—',
    score,
    logo: headshot,
    logoFallback: flag,
    flag,
    record,
    linescores: comp.linescores?.map((l: any) => l.displayValue ?? l.value) as (number | string)[],
  };
}

function parseFightResult(details: any[]): string | undefined {
  const winner = details?.find((d) => /winner/i.test(d?.type?.text ?? ''));
  if (winner?.type?.text) return winner.type.text.replace(/^Unofficial Winner\s*/i, '');
  const results = details?.find((d) => d?.type?.text === 'Results');
  return results?.type?.text;
}

function parseFightEventLog(details: any[]): StatItem[] | undefined {
  if (!details?.length) return undefined;
  return details.slice(0, 15).map((d) => ({
    label: d.type?.text ?? 'Event',
    value: d.athletesInvolved?.[0]?.displayName ?? '—',
  }));
}

function parseFightLeaders(competition: any, profile: ReturnType<typeof getSportProfile>): Player[] {
  const players: Player[] = [];
  for (const comp of competition.competitors ?? []) {
    const athlete = comp.athlete ?? {};
    if (!athlete.displayName) continue;
    const record = comp.records?.[0]?.summary ?? '—';
    const { headshot, flag } = resolveMmaFighterAssets(comp);
    players.push({
      id: String(comp.id ?? athlete.id ?? athlete.displayName),
      name: athlete.displayName,
      team: athlete.flag?.alt ?? '—',
      position: comp.winner ? 'Winner' : 'Fighter',
      headshot: headshot ?? flag,
      stats: pickOrderedStats([{ label: 'Record', value: record }], profile.leaderStatOrder),
    });
  }
  return players;
}

function parseStatus(event: any, competition: any) {
  const profile = getSportProfile('FIGHTS');
  const statusSource = competition?.status ?? event.status;
  const state = statusSource?.type?.state as 'pre' | 'in' | 'post' | undefined;

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

export function parseFightEvents(events: any[], org = 'UFC'): Game[] {
  const profile = getSportProfile('FIGHTS');
  const games: Game[] = [];
  const batch = new ParseBatchAccumulator();

  for (const event of events) {
    const cardName = event.name ?? event.shortName;
    const venue = event.venue?.fullName ?? event.venue?.displayName;

    for (const competition of event.competitions ?? []) {
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

        const weightClass = competition.type?.abbreviation ?? competition.type?.text
          ?? (org === 'Boxing' ? 'Boxing' : undefined);
        const statusSource = competition?.status ?? event.status;
        const fightResult = parseFightResult(competition.details ?? [])
          ?? (statusState === 'post' ? statusSource?.type?.detail : undefined);
        const subtitle = [cardName, weightClass].filter(Boolean).join(' · ');

        const topPerformers = profile.showPerformers
          ? parseFightLeaders(competition, profile)
          : undefined;

        games.push({
          id: `${event.id}-${competition.id}`,
          sport: org,
          status,
          statusState,
          clock: timingResult.clock,
          timing: timingResult.timing,
          away: parseFighter(sorted[0], statusState),
          home: parseFighter(sorted[1], statusState),
          subtitle,
          tournamentName: cardName,
          weightClass,
          round: fightResult,
          venue,
          eventLog: profile.showEventLog ? parseFightEventLog(competition.details ?? []) : undefined,
          topPerformers: topPerformers?.length ? topPerformers : undefined,
        });
      } catch {
        batch.skipped += 1;
      }
    }
  }

  batch.finish('FIGHTS', games);
  return games;
}

export function findFightInScoreboard(raw: unknown, gameId: string): { event: any; competition: any } | null {
  const data = raw as { events?: any[] };
  for (const event of data?.events ?? []) {
    for (const competition of event.competitions ?? []) {
      if (`${event.id}-${competition.id}` === gameId) {
        return { event, competition };
      }
    }
  }
  return null;
}

export function enrichFightGameDetail(game: Game, raw: unknown): Partial<Game> {
  const match = findFightInScoreboard(raw, game.id);
  if (!match) return {};
  const refreshed = parseFightEvents([match.event], game.sport ?? 'UFC');
  const found = refreshed.find((g) => g.id === game.id);
  if (!found) return {};
  return {
    ...found,
    sport: game.sport ?? found.sport,
    leagueSlug: game.leagueSlug ?? found.leagueSlug,
    context: game.context ?? found.context,
  };
}
