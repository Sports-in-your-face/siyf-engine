import { getSportProfile, pickOrderedStats } from '../../config/sportProfiles';
import { createEngineLog } from '../../engine/core/engineUtils';
import type { Game, GameContext, Player, StatItem, Team } from '../../types';
import type { SportType } from '../api';
import { applyContextToSubtitle, parseGameContext } from './parseBasketballContext';
import { applyHockeyContextToSubtitle, parseHockeyGameContext } from './parseHockeyContext';
import {
  applyFootballContextToSubtitle,
  parseFootballGameContext,
} from './parseFootballContext';
import {
  applyBaseballContextToSubtitle,
  parseBaseballGameContext,
} from './parseBaseballContext';
import {
  applySoccerContextToSubtitle,
  extractSoccerLeagueSlug,
  parseSoccerGameContext,
} from './parseSoccerContext';
import { recordParseBatch } from '../../engine/adjuster';
import { resolveEspnCompetitorField } from '../../engine/adjuster/espnResolver';
import {
  resolveEspnDisplayClock,
  resolveEspnEventField,
  resolveEspnStatusState,
} from '../../engine/adjuster/espnEventResolver';
import { enrichParsedTeamFromCdn } from '../../engine/sources/cdnTeamAssets';
import { coerceDisplayString, parseDisplayScore, shouldUseNbaTeamCdn } from '../../utils/coerce';
import { enrichGameWithTiming, extractEspnStartCandidates } from '../../utils/gameTime';
import { resolveMmaFighterAssets, resolveTennisAthleteAssets } from '../../utils/fighterAssets';
import type {
  EspnAthleteEntity,
  EspnCompetition,
  EspnCompetitor,
  EspnGameEvent,
  EspnLeaderGroup,
  EspnStatistic,
  EspnTeamEntity,
} from './espnParserTypes';
import { isEspnGameEvent as isEspnEvent } from './espnParserTypes';

const log = createEngineLog('parseGameEvent');

function parseScore(value: unknown): number | string | null {
  return parseDisplayScore(value);
}

const WNBA_TEAM_NAMES = [
  'atlanta dream', 'chicago sky', 'indiana fever', 'new york liberty',
  'las vegas aces', 'seattle storm', 'phoenix mercury', 'minnesota lynx',
  'dallas wings', 'connecticut sun', 'golden state valkyries',
  'washington mystics', 'los angeles sparks',
];

function detectBasketballLeague(event: EspnGameEvent, competition: EspnCompetition): string | undefined {
  const leagueAbbr = coerceDisplayString(
    resolveEspnEventField(event, 'leagueAbbr') ?? competition?.league?.abbreviation,
  );
  const leagueSlug = coerceDisplayString(
    resolveEspnEventField(event, 'leagueSlug') ?? competition?.league?.slug,
  );
  const hint = `${leagueAbbr ?? ''} ${leagueSlug ?? ''} ${event.name ?? ''}`.toUpperCase();
  if (hint.includes('WNBA')) return 'WNBA';
  if (hint.includes('NCAA') || hint.includes('NCAAM') || hint.includes('NCAAW')) return 'NCAA';

  const teamNames = (competition.competitors ?? [])
    .map((c) => coerceDisplayString(c.team?.displayName ?? c.team?.name).toLowerCase())
    .join(' ');
  if (WNBA_TEAM_NAMES.some((name) => teamNames.includes(name))) return 'WNBA';

  return undefined;
}

function getLogo(entity: EspnTeamEntity | EspnAthleteEntity): string | undefined {
  const team = entity as EspnTeamEntity;
  const athlete = entity as EspnAthleteEntity;
  if (team.logo) return team.logo;
  if (team.logos?.[0]?.href) return team.logos[0].href;
  if (athlete.headshot && typeof athlete.headshot === 'object') return athlete.headshot.href;
  if (typeof athlete.headshot === 'string') return athlete.headshot;
  if (athlete.flag?.href) return athlete.flag.href;
  return undefined;
}

function getTeamColors(team: EspnTeamEntity) {
  const primary = team.color ? `#${team.color}` : undefined;
  const alternate = team.alternateColor ? `#${team.alternateColor}` : undefined;
  return { color: primary, alternateColor: alternate };
}

function parseStatus(event: EspnGameEvent, sport: SportType, competition?: EspnCompetition) {
  const profile = getSportProfile(sport);
  const state = resolveEspnStatusState(event, competition);
  const statusSource = competition?.status ?? event.status;
  const shortDetail = coerceDisplayString(
    resolveEspnEventField(event, 'statusShortDetail')
    ?? statusSource?.type?.shortDetail
    ?? statusSource?.type?.detail,
  );
  const detail = coerceDisplayString(statusSource?.type?.detail);
  const clock = coerceDisplayString(
    resolveEspnDisplayClock(event, competition)
    ?? statusSource?.displayClock
    ?? detail,
  ) || '—';

  if (state === 'pre') {
    return {
      status: profile.scheduledLabel,
      statusState: 'pre' as const,
      clock: '—',
    };
  }

  if (state === 'post') {
    return {
      status: shortDetail || profile.finalLabel,
      statusState: 'post' as const,
      clock: detail || profile.finalLabel,
    };
  }

  return {
    status: shortDetail || 'Live',
    statusState: 'in' as const,
    clock,
  };
}

function parseLeaders(competitors: EspnCompetitor[], profile: ReturnType<typeof getSportProfile>): Player[] {
  const playerMap = new Map<string, Player>();
  const skip = new Set(profile.skipLeaderGroups);

  competitors.forEach((teamData) => {
    if (!teamData.leaders?.length) return;

    const sideLabel =
      teamData.team?.abbreviation
      || teamData.athlete?.shortName?.slice(0, 3)?.toUpperCase()
      || '—';

    teamData.leaders.forEach((leaderGroup: EspnLeaderGroup) => {
      const groupKey = leaderGroup.name || leaderGroup.shortDisplayName || '';
      if (skip.has(groupKey)) return;
      if (!leaderGroup.leaders?.length) return;

      leaderGroup.leaders.forEach((l) => {
        if (!l.athlete?.displayName || l.athlete.id === undefined) return;

        const id = String(l.athlete.id);
        let player = playerMap.get(id);
        if (!player) {
          const headshot = l.athlete.headshot;
          player = {
            id,
            name: l.athlete.displayName,
            team: sideLabel,
            position: l.athlete.position?.abbreviation ?? (profile.id === 'FIGHTS' ? 'Fighter' : '—'),
            headshot: typeof headshot === 'object' ? headshot?.href : headshot,
            number: l.athlete.jersey,
            stats: [],
          };
          playerMap.set(id, player);
        }

        const label = leaderGroup.shortDisplayName || leaderGroup.abbreviation || leaderGroup.displayName;
        const value = String(l.displayValue ?? '');
        if (!label || value.includes(',')) return;

        if (!player.stats.some((s) => s.label === label)) {
          player.stats.push({ label, value });
        }
      });
    });
  });

  return Array.from(playerMap.values())
    .map((player) => ({
      ...player,
      stats: pickOrderedStats(player.stats, profile.leaderStatOrder),
    }))
    .sort((a, b) => b.stats.length - a.stats.length || a.name.localeCompare(b.name));
}

function parseTeamCompetitor(comp: EspnCompetitor, sport: SportType, leagueSport?: string): Team {
  const team = comp.team ?? {};
  const resolvedName = resolveEspnCompetitorField(comp, 'teamName');
  const resolvedAbbr = resolveEspnCompetitorField(comp, 'teamAbbr');
  const resolvedId = resolveEspnCompetitorField(comp, 'teamId');
  const parsed: Team = {
    id: resolvedId != null ? String(resolvedId) : (team.id != null ? String(team.id) : undefined),
    name: coerceDisplayString(resolvedName ?? team.displayName ?? team.name, team.abbreviation || 'TBD'),
    abbr: coerceDisplayString(
      resolvedAbbr ?? team.abbreviation,
      coerceDisplayString(team.name, '—').slice(0, 3).toUpperCase() || '—',
    ),
    score: parseScore(resolveEspnCompetitorField(comp, 'score') ?? comp.score),
    logo: getLogo(team),
    ...getTeamColors(team),
    linescores: comp.linescores?.map((l) =>
      parseScore(resolveEspnCompetitorField(l, 'linescoreValue') ?? l.value) ?? 0,
    ) as (number | string)[],
    record: coerceDisplayString(resolveEspnCompetitorField(comp, 'record')),
  };
  if (sport === 'BASKETBALL' && leagueSport && !shouldUseNbaTeamCdn({ sport: leagueSport })) {
    return parsed;
  }
  return enrichParsedTeamFromCdn(sport, parsed);
}

function parseAthleteCompetitor(comp: EspnCompetitor, sport?: SportType): Team {
  const athlete = comp.athlete ?? {};
  const record = comp.records?.[0]?.summary;
  const base = {
    name: coerceDisplayString(resolveEspnCompetitorField(comp, 'teamName'), 'TBD'),
    abbr: athlete.flag?.abbreviation || athlete.shortName?.slice(0, 3)?.toUpperCase() || '—',
    score: parseScore(comp.score ?? comp.linescore?.score),
    linescores: comp.linescores?.map((l) => parseScore(l.value) ?? 0) as (number | string)[],
    record,
  };

  if (sport) {
    const layout = getSportProfile(sport).layout;
    if (layout === 'fight') {
      const { headshot, flag } = resolveMmaFighterAssets(comp);
      return { ...base, logo: headshot, logoFallback: flag, flag };
    }
    if (layout === 'matchup') {
      const { headshot, flag } = resolveTennisAthleteAssets(comp);
      const name = base.name;
      return {
        ...base,
        abbr: athlete.flag?.abbreviation || athlete.shortName?.slice(0, 3)?.toUpperCase()
          || (name === 'TBD' ? 'TBD' : '—'),
        logo: headshot,
        logoFallback: flag,
        flag,
      };
    }
  }

  return { ...base, logo: getLogo(athlete) };
}

function parseTeamStats(competition: EspnCompetition): { away: StatItem[]; home: StatItem[] } | undefined {
  const home = competition.competitors?.find((c) => c.homeAway === 'home');
  const away = competition.competitors?.find((c) => c.homeAway === 'away');
  if (!home?.statistics?.length && !away?.statistics?.length) return undefined;

  const mapStats = (comp?: EspnCompetitor): StatItem[] =>
    (comp?.statistics ?? [])
      .filter((s: EspnStatistic) => s.displayValue !== undefined)
      .map((s) => ({
        label: s.name || s.abbreviation || s.displayName || '—',
        value: String(s.displayValue),
      }))
      .slice(0, 8);

  const awayStats = mapStats(away);
  const homeStats = mapStats(home);
  if (!awayStats.length && !homeStats.length) return undefined;
  return { away: awayStats, home: homeStats };
}

function parseEventLog(competition: EspnCompetition): StatItem[] | undefined {
  if (!competition.details?.length) return undefined;

  return competition.details.slice(0, 12).map((d) => ({
    label: d.clock?.displayValue || d.period?.displayValue || d.type?.text || 'Event',
    value: d.athletesInvolved?.[0]?.displayName
      ? `${d.athletesInvolved[0].displayName}${d.text ? ` — ${d.text}` : ''}`
      : d.text || d.shortText || d.type?.text || '—',
  }));
}

function buildGame(
  id: string,
  sport: SportType,
  event: EspnGameEvent,
  competition: EspnCompetition,
  away: Team,
  home: Team,
  leagueSport?: string,
): Game {
  const profile = getSportProfile(sport);
  const { status, statusState, clock } = parseStatus(event, sport, competition);
  const competitors = competition.competitors ?? [];

  const topPerformers = profile.showPerformers
    ? parseLeaders(competitors, profile)
    : undefined;

  let context: GameContext | undefined;
  let leagueSlug: string | undefined;
  if (sport === 'BASKETBALL') {
    context = parseGameContext(event, competition, away.abbr, home.abbr);
    if (context && (context.phase === 'finals' || context.phase === 'playoffs')) {
      if (context.awaySeriesRecord) away = { ...away, record: context.awaySeriesRecord };
      if (context.homeSeriesRecord) home = { ...home, record: context.homeSeriesRecord };
    }
  } else if (sport === 'FOOTBALL') {
    context = parseFootballGameContext(event, competition, away.abbr, home.abbr);
  } else if (sport === 'BASEBALL') {
    context = parseBaseballGameContext(event, competition, away.abbr, home.abbr);
  } else if (sport === 'SOCCER') {
    leagueSlug = extractSoccerLeagueSlug(event, competition);
    context = parseSoccerGameContext(event, competition, away.abbr, home.abbr, leagueSlug);
  } else if (sport === 'HOCKEY') {
    context = parseHockeyGameContext(event, competition, away.abbr, home.abbr);
    if (context?.awaySeriesRecord) away = { ...away, record: context.awaySeriesRecord };
    if (context?.homeSeriesRecord) home = { ...home, record: context.homeSeriesRecord };
  }

  const rawSubtitle = sport === 'BASKETBALL' || sport === 'FOOTBALL' || sport === 'SOCCER' || sport === 'BASEBALL' || sport === 'HOCKEY'
    ? undefined
    : (competition.type?.abbreviation || event.name);

  const timingResult = enrichGameWithTiming(
    { statusState, clock },
    extractEspnStartCandidates(event, competition),
  );

  return {
    id,
    sport: leagueSport ?? sport,
    status,
    statusState,
    clock: timingResult.clock,
    timing: timingResult.timing,
    away,
    home,
    topPerformers: topPerformers?.length ? topPerformers : undefined,
    teamStats: profile.showTeamStats ? parseTeamStats(competition) : undefined,
    eventLog: profile.showEventLog ? parseEventLog(competition) : undefined,
    subtitle: sport === 'FOOTBALL'
      ? applyFootballContextToSubtitle(context, rawSubtitle)
      : sport === 'BASEBALL'
        ? applyBaseballContextToSubtitle(context, rawSubtitle)
        : sport === 'SOCCER'
          ? applySoccerContextToSubtitle(context, rawSubtitle)
          : sport === 'HOCKEY'
            ? applyHockeyContextToSubtitle(context, rawSubtitle)
            : applyContextToSubtitle(context, rawSubtitle),
    context,
    leagueSlug,
  };
}

function parseTeamEvent(event: EspnGameEvent, sport: SportType): Game | null {
  const competition = event.competitions?.[0];
  if (!competition) return null;

  const homeComp = competition.competitors?.find((c) => c.homeAway === 'home');
  const awayComp = competition.competitors?.find((c) => c.homeAway === 'away');
  if (!homeComp || !awayComp) return null;

  const leagueSport = sport === 'BASKETBALL' ? detectBasketballLeague(event, competition) : undefined;

  return buildGame(
    String(event.id),
    sport,
    event,
    competition,
    parseTeamCompetitor(awayComp, sport, leagueSport),
    parseTeamCompetitor(homeComp, sport, leagueSport),
    leagueSport,
  );
}

function parseMatchupEvent(event: EspnGameEvent, sport: SportType): Game | null {
  const competition = event.competitions?.[0];
  if (!competition?.competitors?.length) return null;

  const sorted = [...competition.competitors].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  if (sorted.length < 2) return null;

  return buildGame(
    String(event.id),
    sport,
    event,
    competition,
    parseAthleteCompetitor(sorted[0], sport),
    parseAthleteCompetitor(sorted[1], sport),
  );
}

function parseLeaderboardEvent(event: EspnGameEvent, sport: SportType): Game | null {
  const competition = event.competitions?.[0];
  if (!competition?.competitors?.length) return null;

  const sorted = [...competition.competitors].sort(
    (a, b) => (a.order ?? 99) - (b.order ?? 99),
  );
  const leader = sorted[0];
  const runnerUp = sorted[1] ?? sorted[0];

  const leaderTeam = parseAthleteCompetitor(leader);
  const fieldTeam = parseAthleteCompetitor(runnerUp);
  fieldTeam.name = runnerUp ? fieldTeam.name : 'Field';
  fieldTeam.abbr = runnerUp ? fieldTeam.abbr : 'FLD';

  return buildGame(
    String(event.id),
    sport,
    event,
    competition,
    leaderTeam,
    fieldTeam,
  );
}

function parseFightCompetition(event: EspnGameEvent, competition: EspnCompetition, sport: SportType): Game | null {
  if (!competition.competitors?.length) return null;

  const sorted = [...competition.competitors].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  if (sorted.length < 2) return null;

  const fightId = `${event.id}-${competition.id}`;

  return buildGame(
    fightId,
    sport,
    { ...event, status: competition.status ?? event.status },
    competition,
    parseAthleteCompetitor(sorted[0], sport),
    parseAthleteCompetitor(sorted[1], sport),
  );
}

export interface ParseEventsOptions {
  /** Override sport key used for adjuster telemetry (e.g. WNBA games parsed as BASKETBALL). */
  telemetrySport?: string;
}

export function parseEventsForSport(
  events: unknown[],
  sport: SportType,
  options?: ParseEventsOptions,
): Game[] {
  const profile = getSportProfile(sport);
  const games: Game[] = [];
  let skipped = 0;

  for (const raw of events) {
    try {
      if (!isEspnEvent(raw)) {
        skipped++;
        continue;
      }
      const event = raw;

      if (profile.layout === 'fight') {
        const competitions = event.competitions ?? [];
        for (const competition of competitions) {
          const fight = parseFightCompetition(event, competition, sport);
          if (fight) games.push(fight);
        }
        continue;
      }

      if (profile.layout === 'leaderboard') {
        const game = parseLeaderboardEvent(event, sport);
        if (game) games.push(game);
        else skipped++;
        continue;
      }

      if (profile.layout === 'matchup') {
        const game = parseMatchupEvent(event, sport);
        if (game) games.push(game);
        else skipped++;
        continue;
      }

      const game = parseTeamEvent(event, sport);
      if (game) games.push(game);
      else skipped++;
    } catch (err) {
      skipped++;
      log('warn', 'parseEventsForSport', `malformed ${sport} event`, err);
    }
  }

  if (skipped > 0) {
    log('warn', 'parseEventsForSport', `skipped ${skipped}/${events.length} ${sport} events`);
  }

  recordParseBatch({
    sport: options?.telemetrySport ?? sport,
    rawCount: events.length,
    parsed: games,
    skipped,
  });

  return games;
}
