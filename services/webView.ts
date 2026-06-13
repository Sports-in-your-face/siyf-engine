import type { StandingsGroup } from '../engine/core/types';
import { getSportProfile } from '../config/sportProfiles';
import type { SportType } from './api';
import type { Game, Team, GameDetail, GameBoxScore, PlayEvent, StatItem } from '../types';
import { displaySubtitle } from '../utils/gameDisplay';
import { getUserTimezone } from '../utils/gameTime';
import { getTeamAccent } from '../utils/teamColors';
import { extractGameOdds, isSpecialGameCard, specialGameLabel, gameMetaLine, specialGameLogo } from '../utils/gameMeta';

export type WebGameStatus = 'pre' | 'live' | 'final';

export type DateBucket = 'yesterday' | 'today' | 'tomorrow';

export interface WebTeamView {
  name: string;
  abbr: string;
  logo: string;
  score: number;
  record?: string;
  /** ESPN team id when available (disambiguates shared abbreviations). */
  id?: string;
}

export interface WebGameLeader {
  player: string;
  stat: string;
  value: string;
  team: string;
  teamLogo: string;
  headshot?: string;
}

export interface WebGameOdds {
  spread?: string;
  total?: string;
  book?: string;
}

export interface WebGolfLeaderboardRow {
  id: string;
  position: number;
  name: string;
  toPar?: string;
  score: string;
  thru?: string;
  country?: string;
  linescores?: (number | string)[];
}

export interface WebGolfTournamentMeta {
  tournamentName?: string;
  par?: string;
  purse?: string;
  cutLine?: string;
  yardage?: string;
  fieldSize?: number;
  leaderboardRows?: WebGolfLeaderboardRow[];
}

function golfStatValue(stats: StatItem[] | undefined, needle: string): string | undefined {
  if (!stats?.length) return undefined;
  const key = needle.toLowerCase();
  return stats.find((s) => s.label.toLowerCase().includes(key))?.value;
}

/** Map golf tournament fields for web leaderboards and detail panels. */
export function adaptGolfGameForWeb(game: Game): WebGolfTournamentMeta {
  const tournamentStats = game.teamStats?.home ?? [];
  const cutFromLog = game.eventLog?.find((e) => /cut/i.test(e.label))?.value;
  const fieldStat = golfStatValue(tournamentStats, 'field');
  const leaderboardRows: WebGolfLeaderboardRow[] = (game.leaderboard ?? []).map((entry, idx) => ({
    id: entry.id || `lb-${idx}`,
    position: entry.position ?? idx + 1,
    name: entry.name,
    toPar: entry.toPar,
    score: entry.score,
    thru: entry.thru,
    country: entry.country,
    linescores: entry.linescores,
  }));

  return {
    tournamentName: game.tournamentName,
    par: golfStatValue(tournamentStats, 'par'),
    purse: golfStatValue(tournamentStats, 'purse'),
    cutLine: golfStatValue(tournamentStats, 'cut') ?? cutFromLog,
    yardage: golfStatValue(tournamentStats, 'yard') ?? golfStatValue(tournamentStats, 'yards'),
    fieldSize: leaderboardRows.length || (fieldStat ? Number(fieldStat) : undefined),
    leaderboardRows: leaderboardRows.length ? leaderboardRows : undefined,
  };
}

export interface WebFightFighterView {
  id?: string;
  name: string;
  record?: string;
  headshot?: string;
  flag?: string;
  nationality?: string;
  result?: string;
  isWinner?: boolean;
}

export interface WebFightRoundScore {
  round: number;
  fighter1: string | number;
  fighter2: string | number;
}

export interface WebFightBoutMeta {
  cardName?: string;
  weightClass?: string;
  method?: string;
  org?: string;
  boutLabel?: string;
  fighter1: WebFightFighterView;
  fighter2: WebFightFighterView;
  roundScores?: WebFightRoundScore[];
}

function fightResultLabel(score: number | string | null | undefined, statusState?: string): string | undefined {
  if (score == null || score === '') return undefined;
  const raw = String(score);
  if (statusState === 'post' && (raw === 'W' || raw === 'L')) return raw;
  if (raw === 'W' || raw === 'L') return raw;
  return raw;
}

function isFightWinner(team: Team, statusState?: string): boolean {
  if (statusState !== 'post') return false;
  return String(team.score) === 'W';
}

function parseFightMethod(game: Game): string | undefined {
  if (game.round && !/^scheduled$/i.test(game.round)) return game.round;
  if (game.statusState === 'post' && game.status && !/^final$/i.test(game.status)) return game.status;
  if (game.clock && game.statusState === 'post' && game.clock !== 'Final') return game.clock;
  return undefined;
}

function buildFightRoundScores(game: Game): WebFightRoundScore[] | undefined {
  const away = game.away.linescores ?? [];
  const home = game.home.linescores ?? [];
  if (!away.length && !home.length) return undefined;
  const count = Math.max(away.length, home.length);
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    fighter1: away[i] ?? '—',
    fighter2: home[i] ?? '—',
  }));
}

function toFightFighterView(team: Team, statusState?: string): WebFightFighterView {
  return {
    id: team.id,
    name: team.name,
    record: team.record,
    headshot: team.logo,
    flag: team.flag ?? team.logoFallback,
    nationality: team.abbr,
    result: fightResultLabel(team.score, statusState),
    isWinner: isFightWinner(team, statusState),
  };
}

/** Map MMA/boxing bout fields for web fight cards and detail panels. */
export function adaptFightForWeb(game: Game): WebFightBoutMeta {
  const weightClass = game.weightClass ?? '';
  const boutLabel = /championship/i.test(weightClass)
    ? 'Main Event'
    : (game.context?.badge || game.context?.round || undefined);

  return {
    cardName: game.tournamentName ?? game.subtitle?.split(' · ')[0],
    weightClass: game.weightClass,
    method: parseFightMethod(game),
    org: game.sport ?? game.leagueSlug,
    boutLabel,
    fighter1: toFightFighterView(game.away, game.statusState),
    fighter2: toFightFighterView(game.home, game.statusState),
    roundScores: buildFightRoundScores(game),
  };
}

export interface WebGameView {
  id: string;
  status: WebGameStatus;
  statusLabel: string;
  venue?: string;
  broadcast?: string;
  series?: string | null;
  home: WebTeamView;
  away: WebTeamView;
  quarters?: { labels: string[]; away: (number | string)[]; home: (number | string)[] };
  periods?: { labels: string[]; away: (number | string)[]; home: (number | string)[]; ot?: { away: number | string; home: number | string } };
  lineScore?: { innings: (number | string)[]; away: (number | string)[]; home: (number | string)[] };
  leaders?: WebGameLeader[];
  sport?: string;
  sportIcon?: string;
  link?: string;
  /** Engine-sourced odds (free tier, from Action Network context). */
  odds?: WebGameOdds | null;
  /** True when the game is classified as a marquee/special event. */
  isSpecial?: boolean;
  /** Short label for the special event (e.g. "Super Bowl", "Finals Game 7"). */
  specialLabel?: string;
  /** Venue · broadcast · attendance formatted line. */
  metaLine?: string;
  /** Sub-league identifier for filtering/badges (WNBA, NCAA, UCL, Boxing, etc.). */
  leagueTag?: string;
  /** Parent sport label for marquee cards (NBA, NFL, NHL, etc.). */
  eventSportLabel?: string;
  /** Catalog logo for marquee/special events (from engine classification). */
  eventLogo?: string;
  /** Engine sport key when `includeSportMeta` is set (Home / Calendar detail fetch). */
  engineSport?: SportType;
  /** ISO start time from engine timing. */
  startTime?: string;
  /** Golf tournament fields (from adaptGolfGameForWeb). */
  tournamentName?: string;
  par?: string;
  purse?: string;
  cutLine?: string;
  yardage?: string;
  fieldSize?: number;
  leaderboardRows?: WebGolfLeaderboardRow[];
  /** MMA/boxing bout layout (from adaptFightForWeb). */
  fight?: WebFightBoutMeta;
}

export interface WebStandingsRow {
  abbr: string;
  logo: string;
  w: number;
  l: number;
  pct: string;
  gb: string;
  strk: string;
  finals?: boolean;
  name?: string;
  record?: string;
}

export interface WebDivisionTeam {
  abbr: string;
  name: string;
  logo: string;
  record: string;
  color?: string;
  w?: number;
  l?: number;
  d?: number;
  otl?: number;
  pts?: string;
  gd?: string;
  pct?: string;
  gb?: string;
  strk?: string;
}

export interface WebDivision {
  name: string;
  teams: WebDivisionTeam[];
}

const SOCCER_LEAGUE_LABELS: Record<string, string> = {
  'eng.1': 'Premier League',
  'esp.1': 'La Liga',
  'ger.1': 'Bundesliga',
  'fra.1': 'Ligue 1',
  'ita.1': 'Serie A',
  'ned.1': 'Eredivisie',
  'por.1': 'Primeira Liga',
  'eng.2': 'Championship',
  'usa.1': 'MLS',
  'mex.1': 'Liga MX',
  'bra.1': 'Brasileirão',
  'uefa.champions': 'UCL',
  'uefa.europa': 'Europa',
  'uefa.europa.conf': 'UECL',
  'eng.fa': 'FA Cup',
  'eng.league_cup': 'League Cup',
};

const FIGHTS_LEAGUE_LABELS: Record<string, string> = {
  ufc: 'UFC',
  boxing: 'Boxing',
  bellator: 'Bellator',
  pfl: 'PFL',
};

function deriveLeagueTag(game: Game, sport: SportType): string | undefined {
  if (sport === 'BASKETBALL') {
    const sub = game.sport?.toUpperCase();
    if (sub === 'WNBA') return 'WNBA';
    if (sub === 'NCAA') return 'NCAA';
    return 'NBA';
  }
  if (sport === 'SOCCER' && game.leagueSlug) {
    return SOCCER_LEAGUE_LABELS[game.leagueSlug] ?? game.leagueSlug.toUpperCase();
  }
  if (sport === 'FIGHTS' && game.leagueSlug) {
    return FIGHTS_LEAGUE_LABELS[game.leagueSlug.toLowerCase()] ?? game.leagueSlug.toUpperCase();
  }
  if (sport === 'TENNIS' && game.sport) {
    return game.sport === 'WTA' ? 'WTA' : 'ATP';
  }
  if (sport === 'GOLF') {
    const sub = game.sport?.toUpperCase();
    if (sub === 'LPGA') return 'LPGA';
    if (sub === 'PGA' || game.leagueSlug === 'pga') return 'PGA';
    if (game.leagueSlug === 'lpga') return 'LPGA';
    return 'PGA';
  }
  if (sport === 'FOOTBALL') return 'NFL';
  if (sport === 'HOCKEY') return 'NHL';
  if (sport === 'BASEBALL') return 'MLB';
  return undefined;
}

const SPORT_UI: Record<SportType, { label: string; icon: string; route: string }> = {
  BASKETBALL: { label: 'NBA', icon: 'ph-basketball', route: '/nba' },
  FOOTBALL: { label: 'NFL', icon: 'ph-football', route: '/nfl' },
  BASEBALL: { label: 'MLB', icon: 'ph-baseball', route: '/mlb' },
  HOCKEY: { label: 'NHL', icon: 'ph-snowflake', route: '/nhl' },
  SOCCER: { label: 'MLS', icon: 'ph-soccer-ball', route: '/mls' },
  GOLF: { label: 'Golf', icon: 'ph-golf', route: '/golf' },
  TENNIS: { label: 'Tennis', icon: 'ph-tennis-ball', route: '/tennis' },
  FIGHTS: { label: 'Fights', icon: 'ph-hand-fist', route: '/fights' },
};

const DAY_MS = 86_400_000;

function localCalendarKey(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${y}-${m}-${day}`;
}

function localDayDiff(from: Date, to: Date, tz: string): number {
  const [fromKey, toKey] = [localCalendarKey(from, tz), localCalendarKey(to, tz)];
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / DAY_MS);
}

/** YYYY-MM-DD in the user's local timezone (for calendar grids). */
export function calendarDateKey(d: Date, tz = getUserTimezone()): string {
  return localCalendarKey(d, tz);
}

export function todayCalendarKey(now = new Date(), tz = getUserTimezone()): string {
  return localCalendarKey(now, tz);
}

export function shiftCalendarDate(dateStr: string, days: number, tz = getUserTimezone()): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const shifted = new Date(y, m - 1, d);
  shifted.setDate(shifted.getDate() + days);
  return localCalendarKey(shifted, tz);
}

/** Local calendar day for a scoreboard game (matches bucketGamesByDate). */
export function gameCalendarDate(game: Game, now = new Date(), tz = getUserTimezone()): string {
  const startIso = game.timing?.startTime;
  if (startIso) {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(startIso)
      ? new Date(`${startIso}T12:00:00`)
      : new Date(startIso);
    if (!Number.isNaN(start.getTime())) return localCalendarKey(start, tz);
  }
  if (game.statusState === 'post') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return localCalendarKey(yesterday, tz);
  }
  return localCalendarKey(now, tz);
}

function mapStatus(state?: 'pre' | 'in' | 'post'): WebGameStatus {
  if (state === 'in') return 'live';
  if (state === 'post') return 'final';
  return 'pre';
}

function coerceScore(score: number | string | null | undefined): number {
  if (typeof score === 'number') return score;
  if (score == null) return 0;
  const n = parseInt(String(score), 10);
  return Number.isNaN(n) ? 0 : n;
}

function buildStatusLabel(game: Game): string {
  if (game.timing?.stale && game.statusState === 'pre') return 'Delayed';
  const status = mapStatus(game.statusState);
  if (status === 'final') return 'Final';
  if (status === 'live') return game.clock || game.status || 'Live';
  return game.clock || game.timing?.localStart || game.status || 'Scheduled';
}

function buildSeriesLabel(game: Game): string | null {
  const ctx = game.context;
  if (ctx) {
    const parts: string[] = [];
    if (ctx.round) parts.push(ctx.round);
    if (ctx.seriesSummary) parts.push(ctx.seriesSummary);
    else if (ctx.headline) parts.push(ctx.headline);
    else if (ctx.badge) parts.push(ctx.badge);
    if (parts.length) return parts.join(' · ');
  }
  return displaySubtitle(game) ?? null;
}

function adaptTeam(team: Team): WebTeamView {
  return {
    name: team.name,
    abbr: team.abbr,
    logo: team.logo || team.logoFallback || '',
    score: coerceScore(team.score),
    record: team.record,
    id: team.id,
  };
}

function buildQuarters(game: Game, sport: SportType): WebGameView['quarters'] | undefined {
  const away = game.away.linescores;
  const home = game.home.linescores;
  if (!away?.length && !home?.length) return undefined;

  const profile = getSportProfile(sport);
  const count = Math.max(away?.length ?? 0, home?.length ?? 0);
  const labels = Array.from({ length: count }, (_, i) => profile.getPeriodLabel(i, count));
  return {
    labels,
    away: away ?? [],
    home: home ?? [],
  };
}

function resolveTeamLogo(game: Game, teamAbbr: string): string {
  const upper = (teamAbbr || '').toUpperCase();
  if ((game.home.abbr || '').toUpperCase() === upper) return game.home.logo || '';
  if ((game.away.abbr || '').toUpperCase() === upper) return game.away.logo || '';
  return game.home.logo || game.away.logo || '';
}

function buildLeaders(game: Game, sport: SportType): WebGameLeader[] | undefined {
  if (!getSportProfile(sport).showPerformers) return undefined;
  if (!game.topPerformers?.length) return undefined;
  return game.topPerformers.slice(0, 4).map((p) => ({
    player: p.name,
    stat: p.stats[0]?.label ?? 'Stats',
    value: String(p.stats[0]?.value ?? '-'),
    team: p.team,
    teamLogo: resolveTeamLogo(game, p.team),
    headshot: p.headshot || p.headshotUrl || undefined,
  }));
}

function buildLineScore(game: Game, sport: SportType): WebGameView['lineScore'] | undefined {
  if (sport !== 'BASEBALL') return undefined;
  const away = game.away.linescores ?? [];
  const home = game.home.linescores ?? [];
  if (!away.length && !home.length) return undefined;
  const count = Math.max(away.length, home.length);
  const profile = getSportProfile(sport);
  return {
    innings: Array.from({ length: count }, (_, i) => profile.getPeriodLabel(i, count)),
    away,
    home,
  };
}

function buildPeriods(game: Game, sport: SportType): WebGameView['periods'] | undefined {
  if (sport !== 'HOCKEY') return undefined;
  const away = game.away.linescores ?? [];
  const home = game.home.linescores ?? [];
  if (!away.length && !home.length) return undefined;

  const profile = getSportProfile(sport);
  const regAway = away.slice(0, 3);
  const regHome = home.slice(0, 3);
  const regCount = Math.max(regAway.length, regHome.length, 3);
  const labels = Array.from({ length: regCount }, (_, i) => profile.getPeriodLabel(i, regCount));
  const result: NonNullable<WebGameView['periods']> = { labels, away: regAway, home: regHome };

  if (away.length > 3 || home.length > 3) {
    result.ot = {
      away: away[3] ?? 0,
      home: home[3] ?? 0,
    };
  }
  return result;
}

export function adaptGameForWeb(
  game: Game,
  sport: SportType,
  opts: { includeSportMeta?: boolean } = {},
): WebGameView {
  const meta = opts.includeSportMeta ? SPORT_UI[sport] : undefined;
  const odds = extractGameOdds(game);
  const isSpecial = isSpecialGameCard(game);
  const specialLbl = specialGameLabel(game);
  return {
    id: game.id,
    status: mapStatus(game.statusState),
    statusLabel: buildStatusLabel(game),
    venue: game.venue,
    broadcast: game.broadcast,
    series: buildSeriesLabel(game),
    home: adaptTeam(game.home),
    away: adaptTeam(game.away),
    quarters: buildQuarters(game, sport),
    periods: buildPeriods(game, sport),
    lineScore: buildLineScore(game, sport),
    leaders: buildLeaders(game, sport),
    sport: meta?.label,
    sportIcon: meta?.icon,
    link: meta?.route,
    odds: odds ?? undefined,
    isSpecial: isSpecial || undefined,
    specialLabel: specialLbl,
    eventLogo: specialGameLogo(game) || undefined,
    metaLine: gameMetaLine(game),
    leagueTag: deriveLeagueTag(game, sport),
    ...(isSpecial ? { eventSportLabel: SPORT_UI[sport].label } : {}),
    ...(opts.includeSportMeta ? { engineSport: sport, startTime: game.timing?.startTime } : {}),
    ...(sport === 'GOLF' ? adaptGolfGameForWeb(game) : {}),
    ...(sport === 'FIGHTS' ? { fight: adaptFightForWeb(game) } : {}),
  };
}

export function bucketGamesByDate(
  games: Game[],
  now = new Date(),
  tz = getUserTimezone(),
): Record<DateBucket, Game[]> {
  const buckets: Record<DateBucket, Game[]> = {
    yesterday: [],
    today: [],
    tomorrow: [],
  };

  for (const game of games) {
    const startIso = game.timing?.startTime;
    if (!startIso) {
      if (game.statusState === 'in') buckets.today.push(game);
      else if (game.statusState === 'post') buckets.yesterday.push(game);
      else buckets.today.push(game);
      continue;
    }

    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) {
      buckets.today.push(game);
      continue;
    }

    const diff = localDayDiff(now, start, tz);
    if (diff === -1) buckets.yesterday.push(game);
    else if (diff === 0) buckets.today.push(game);
    else if (diff === 1) buckets.tomorrow.push(game);
    else if (diff < -1) buckets.yesterday.push(game);
    else buckets.tomorrow.push(game);
  }

  return buckets;
}

export function adaptGamesByDateForWeb(
  games: Game[],
  sport: SportType,
  opts: { includeSportMeta?: boolean } = {},
): Record<DateBucket, WebGameView[]> {
  const buckets = bucketGamesByDate(games);
  return {
    yesterday: buckets.yesterday.map((g) => adaptGameForWeb(g, sport, opts)),
    today: buckets.today.map((g) => adaptGameForWeb(g, sport, opts)),
    tomorrow: buckets.tomorrow.map((g) => adaptGameForWeb(g, sport, opts)),
  };
}

export function adaptStandingsRows(group: StandingsGroup): WebStandingsRow[] {
  return group.rows.map((row) => ({
    abbr: row.team.abbr,
    logo: row.team.logo,
    name: row.team.name,
    w: row.wins,
    l: row.losses,
    pct: row.winPct,
    gb: row.gamesBack ?? '-',
    strk: row.streak ?? '-',
    record: `${row.wins}-${row.losses}`,
  }));
}

export function adaptStandingsByConference(
  groups: StandingsGroup[],
): { east: WebStandingsRow[]; west: WebStandingsRow[] } {
  const east = groups.find((g) => /east/i.test(g.name));
  const west = groups.find((g) => /west/i.test(g.name));
  const afc = groups.find((g) => /afc/i.test(g.name) && !/nfc/i.test(g.name));
  const nfc = groups.find((g) => /nfc/i.test(g.name));
  const al = groups.find((g) => /^al$|american/i.test(g.name));
  const nl = groups.find((g) => /^nl$|national/i.test(g.name));

  return {
    east: adaptStandingsRows(east ?? afc ?? al ?? groups[0] ?? { name: '', rows: [] }),
    west: adaptStandingsRows(west ?? nfc ?? nl ?? groups[1] ?? { name: '', rows: [] }),
  };
}

export function adaptDivisionsFromStandings(groups: StandingsGroup[]): WebDivision[] {
  const byDivision = new Map<string, WebDivisionTeam[]>();

  for (const group of groups) {
    for (const row of group.rows) {
      const div = row.team.division || group.name;
      if (!byDivision.has(div)) byDivision.set(div, []);
      const draws = row.draws ?? 0;
      const record = row.draws != null
        ? `${row.wins}-${draws}-${row.losses}`
        : row.otl != null
          ? `${row.wins}-${row.losses}-${row.otl}`
          : `${row.wins}-${row.losses}`;
      byDivision.get(div)!.push({
        abbr: row.team.abbr,
        name: row.team.name,
        logo: row.team.logo,
        record,
        color: getTeamAccent({
          color: row.team.color,
          alternateColor: row.team.alternateColor,
        }),
        w: row.wins,
        l: row.losses,
        d: row.draws,
        otl: row.otl,
        pts: row.points != null ? String(row.points) : row.winPct,
        gd: row.goalDiff,
        pct: row.winPct,
        gb: row.gamesBack,
        strk: row.streak,
      });
    }
  }

  return [...byDivision.entries()].map(([name, teams]) => ({ name, teams }));
}

/** Human-readable fight org label from engine game row. */
export function resolveFightOrgLabel(game: Pick<Game, 'sport' | 'leagueSlug'>): string {
  const slug = (game.leagueSlug || '').toLowerCase();
  if (slug && FIGHTS_LEAGUE_LABELS[slug]) return FIGHTS_LEAGUE_LABELS[slug];
  const sport = (game.sport || '').toUpperCase();
  if (sport === 'BELLATOR') return 'Bellator';
  if (sport === 'PFL') return 'PFL';
  if (sport === 'BOXING' || slug.includes('box')) return 'Boxing';
  return 'UFC';
}

export function getSportUiMeta(sport: SportType) {
  return SPORT_UI[sport];
}

export function hasLiveGames(games: Game[]): boolean {
  return games.some((g) => g.statusState === 'in');
}

export function findFeaturedGame(games: Game[]): Game | undefined {
  const live = games.filter((g) => g.statusState === 'in');
  if (live.length) {
    return live.sort((a, b) => (b.context?.priority ?? 0) - (a.context?.priority ?? 0))[0];
  }
  const special = games.find((g) => g.special?.isSpecial);
  if (special) return special;
  return games[0];
}

export interface WebTennisPlayerView {
  name: string;
  initials: string;
  nat: string;
  sets: number;
}

export interface WebTennisMatchView {
  id: string;
  status: WebGameStatus;
  statusLabel: string;
  tournament: string;
  tournamentName: string;
  round: string;
  surface: string;
  venue?: string;
  broadcast?: string;
  leagueTag?: string;
  metaLine?: string;
  player1: WebTennisPlayerView;
  player2: WebTennisPlayerView;
  setScores?: string[];
}

function playerInitials(name: string): string {
  const safe = (name || 'TBD').trim() || 'TBD';
  return safe
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function fallbackTennisPlayer(team?: Team | null): WebTennisPlayerView {
  const name = team?.name?.trim() || 'TBD';
  return {
    name,
    initials: playerInitials(name),
    nat: team?.abbr || '—',
    sets: coerceScore(team?.score),
  };
}

function buildTennisSetScores(game: Game): string[] | undefined {
  const away = game.away.linescores ?? [];
  const home = game.home.linescores ?? [];
  if (!away.length && !home.length) return undefined;
  const count = Math.max(away.length, home.length);
  const scores: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = away[i] ?? '-';
    const h = home[i] ?? '-';
    scores.push(`${a}-${h}`);
  }
  return scores;
}

export function adaptTennisGameForWeb(game: Game): WebTennisMatchView {
  const tournamentSlug = game.leagueSlug || game.context?.leagueSlug || 'all';
  const tourTag = (game.sport ?? '').toUpperCase() === 'WTA' ? 'WTA' : 'ATP';
  return {
    id: game.id,
    status: mapStatus(game.statusState),
    statusLabel: buildStatusLabel(game),
    tournament: tournamentSlug,
    tournamentName: game.context?.headline || game.subtitle || game.venue || 'Tennis',
    round: game.context?.round || '',
    surface: game.context?.surface || '',
    venue: game.venue,
    broadcast: game.broadcast,
    leagueTag: tourTag,
    player1: fallbackTennisPlayer(game.away),
    player2: fallbackTennisPlayer(game.home),
    setScores: buildTennisSetScores(game),
    metaLine: gameMetaLine(game),
  };
}

export function adaptTennisGamesByDateForWeb(
  games: Game[],
  now = new Date(),
  tz = getUserTimezone(),
): Record<DateBucket, WebTennisMatchView[]> {
  const buckets = bucketGamesByDate(games, now, tz);
  return {
    yesterday: buckets.yesterday.map(adaptTennisGameForWeb),
    today: buckets.today.map(adaptTennisGameForWeb),
    tomorrow: buckets.tomorrow.map(adaptTennisGameForWeb),
  };
}

export interface WebHockeyStandingsTeam {
  abbr: string;
  logo: string;
  gp: number;
  w: number;
  l: number;
  otl: number;
  pts: number;
}

export interface WebHockeyDivisionStandings {
  name: string;
  teams: WebHockeyStandingsTeam[];
}

export function adaptHockeyDivisionStandings(groups: StandingsGroup[]): WebHockeyDivisionStandings[] {
  return groups.map((group) => ({
    name: group.name,
    teams: group.rows.map((row) => {
      const otl = row.otl ?? 0;
      const gp = row.wins + row.losses + otl;
      const pts = row.points ?? (row.wins * 2 + otl);
      return {
        abbr: row.team.abbr,
        logo: row.team.logo,
        gp,
        w: row.wins,
        l: row.losses,
        otl,
        pts,
      };
    }),
  }));
}

export interface WebGameDetailExtras extends WebGolfTournamentMeta {
  boxScore?: GameBoxScore;
  teamStats?: { away: StatItem[]; home: StatItem[] };
  plays?: PlayEvent[];
  eventLog?: StatItem[];
  attendance?: string;
  leaderboard?: Game['leaderboard'];
  weightClass?: string;
  round?: string;
  fight?: WebFightBoutMeta;
  dataSources?: string[];
}

/** Map rich GameDetail fields for UI panels (box score, PBP, team stats, etc.). */
export function adaptGameDetailForWeb(detail: GameDetail, sport?: SportType): WebGameDetailExtras {
  const base: WebGameDetailExtras = {
    boxScore: detail.boxScore,
    teamStats: detail.teamStats,
    plays: detail.plays,
    eventLog: detail.eventLog,
    attendance: detail.attendance,
    leaderboard: detail.leaderboard,
    tournamentName: detail.tournamentName,
    weightClass: detail.weightClass,
    round: detail.round,
    dataSources: detail.dataSources?.length ? [...detail.dataSources] : undefined,
  };

  if (sport === 'FIGHTS') {
    return { ...base, fight: adaptFightForWeb(detail) };
  }

  if (sport === 'GOLF' || detail.leaderboard?.length || detail.tournamentName) {
    return { ...base, ...adaptGolfGameForWeb(detail) };
  }

  return base;
}

export interface WebNflStandingsTeam {
  id: string;
  abbr: string;
  logo: string;
  w: number;
  l: number;
  t: number;
  pct: string;
  pf: string;
  pa: string;
  strk: string;
}

export interface WebNflDivisionStandings {
  division: string;
  teams: WebNflStandingsTeam[];
}

export function adaptNflDivisionStandings(groups: StandingsGroup[]): WebNflDivisionStandings[] {
  return groups.map((group) => ({
    division: group.name,
    teams: group.rows.map((row) => ({
      id: (row.team.abbr || row.team.id || '').toLowerCase(),
      abbr: row.team.abbr,
      logo: row.team.logo || '',
      w: row.wins,
      l: row.losses,
      t: 0,
      pct: row.winPct?.replace(/^0\./, '.') ?? '-',
      pf: '-',
      pa: '-',
      strk: row.streak ?? '-',
    })),
  }));
}
