export interface GameTiming {
  startTime?: string;
  timezone: string;
  localStart: string;
  localDateLabel?: string;
  countdown?: string;
  startsInMs?: number;
  proofed: boolean;
  source?: 'espn-status' | 'espn-event' | 'espn-competition' | 'espn-start' | 'bdl' | 'inferred';
  stale?: boolean;
  imminent?: boolean;
}

export interface StartTimeCandidate {
  iso: string;
  source: GameTiming['source'];
  weight: number;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const NBA_TZ_ABBR: Record<string, string> = {
  EDT: 'America/New_York',
  EST: 'America/New_York',
  ET: 'America/New_York',
  CDT: 'America/Chicago',
  CST: 'America/Chicago',
  CT: 'America/Chicago',
  MDT: 'America/Denver',
  MST: 'America/Denver',
  MT: 'America/Denver',
  PDT: 'America/Los_Angeles',
  PST: 'America/Los_Angeles',
  PT: 'America/Los_Angeles',
};

function parseIso(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null;
  // Date-only strings (e.g. BDL) — avoid UTC-midnight rolling the calendar day backward in US zones
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

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

function zonedLocalToIso(
  year: number,
  month: number,
  day: number,
  hour24: number,
  minute: number,
  timeZone: string,
): string | null {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const targetDay = String(day).padStart(2, '0');
  const targetMonth = String(month).padStart(2, '0');
  const targetHour = String(hour24).padStart(2, '0');
  const targetMinute = String(minute).padStart(2, '0');
  const naive = Date.UTC(year, month - 1, day, hour24, minute);

  for (let offsetHours = -16; offsetHours <= 16; offsetHours++) {
    const candidate = new Date(naive + offsetHours * HOUR);
    const parts = formatter.formatToParts(candidate);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    const h = parts.find((p) => p.type === 'hour')?.value;
    const min = parts.find((p) => p.type === 'minute')?.value;
    if (
      y === String(year)
      && m === targetMonth
      && d === targetDay
      && h === targetHour
      && min === targetMinute
    ) {
      return candidate.toISOString();
    }
  }
  return null;
}

/** Parse ESPN's user-facing schedule string, e.g. "6/8 - 8:30 PM EDT" */
export function extractEspnStatusDetailCandidate(event: any): StartTimeCandidate | null {
  const detail = event?.status?.type?.shortDetail;
  if (!detail || typeof detail !== 'string') return null;

  const match = detail.match(
    /(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*(EDT|EST|CDT|CST|MDT|MST|PDT|PST|ET|CT|MT|PT)?/i,
  );
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  let hour = parseInt(match[3], 10);
  const minute = parseInt(match[4], 10);
  const ampm = match[5].toUpperCase();
  const tzAbbr = (match[6] ?? 'ET').toUpperCase();
  const timeZone = NBA_TZ_ABBR[tzAbbr] ?? 'America/New_York';

  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  const anchor = parseIso(event?.date) ?? new Date();
  let year = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(anchor),
    10,
  );

  let iso = zonedLocalToIso(year, month, day, hour, minute, timeZone);
  if (!iso) return null;

  // If parsed time is far behind anchor, the game may belong to the next calendar year
  if (new Date(iso).getTime() < anchor.getTime() - 180 * DAY) {
    iso = zonedLocalToIso(year + 1, month, day, hour, minute, timeZone) ?? iso;
  }

  return { iso, source: 'espn-status', weight: 4 };
}

export function extractEspnStartCandidates(event: any, competition?: any): StartTimeCandidate[] {
  const candidates: StartTimeCandidate[] = [];
  const comp = competition ?? event?.competitions?.[0];

  const statusDetail = extractEspnStatusDetailCandidate(event);
  if (statusDetail) candidates.push(statusDetail);

  const eventDate = parseIso(event?.date);
  if (eventDate) candidates.push({ iso: eventDate.toISOString(), source: 'espn-event', weight: 3 });

  const compDate = parseIso(comp?.date);
  if (compDate) candidates.push({ iso: compDate.toISOString(), source: 'espn-competition', weight: 2 });

  const startDate = parseIso(comp?.startDate);
  if (startDate) candidates.push({ iso: startDate.toISOString(), source: 'espn-start', weight: 2 });

  return candidates;
}

export function extractBdlStartCandidate(dateStr: string): StartTimeCandidate | null {
  const d = parseIso(dateStr);
  if (!d) return null;
  return { iso: d.toISOString(), source: 'bdl', weight: 1 };
}

export function proofStartTime(candidates: StartTimeCandidate[]): {
  startTime?: string;
  proofed: boolean;
  source?: GameTiming['source'];
} {
  if (!candidates.length) return { proofed: false };

  const sorted = [...candidates].sort((a, b) => b.weight - a.weight);
  const primary = sorted[0];
  const primaryMs = new Date(primary.iso).getTime();

  const agreeing = sorted.filter((c) => Math.abs(new Date(c.iso).getTime() - primaryMs) <= 30 * MINUTE);
  const proofed = agreeing.some((c) => c.weight >= 2);

  const topWeight = primary.weight;
  const topTier = sorted.filter((c) => c.weight === topWeight);
  if (topTier.length > 1) {
    const spread =
      Math.max(...topTier.map((c) => new Date(c.iso).getTime()))
      - Math.min(...topTier.map((c) => new Date(c.iso).getTime()));
    if (spread > 30 * MINUTE) {
      return { startTime: primary.iso, proofed: false, source: primary.source };
    }
  }

  return { startTime: primary.iso, proofed: proofed || topWeight >= 3, source: primary.source };
}

function localDayDiff(from: Date, to: Date, tz: string): number {
  const [fromKey, toKey] = [localCalendarKey(from, tz), localCalendarKey(to, tz)];
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / DAY);
}

export function formatLocalTime(iso: string, tz = getUserTimezone()): string {
  return new Date(iso).toLocaleTimeString([], {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatLocalDateLabel(iso: string, now = new Date(), tz = getUserTimezone()): string {
  const start = new Date(iso);
  const diff = localDayDiff(now, start, tz);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return start.toLocaleDateString([], { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatCountdown(startsInMs: number): string {
  if (startsInMs <= 0) return 'Starting';
  if (startsInMs < 5 * MINUTE) return 'Soon';
  if (startsInMs < HOUR) {
    const m = Math.ceil(startsInMs / MINUTE);
    return `in ${m}m`;
  }
  if (startsInMs < 24 * HOUR) {
    const h = Math.floor(startsInMs / HOUR);
    const m = Math.round((startsInMs % HOUR) / MINUTE);
    return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  }
  const days = Math.floor(startsInMs / DAY);
  const h = Math.round((startsInMs % DAY) / HOUR);
  if (days === 1 && h < 6) return 'Tomorrow';
  return days === 1 ? `in 1d ${h}h` : `in ${days}d`;
}

export function buildGameTiming(
  startTime: string | undefined,
  statusState: 'pre' | 'in' | 'post' | undefined,
  opts: {
    proofed?: boolean;
    source?: GameTiming['source'];
    now?: Date;
    timezone?: string;
  } = {},
): GameTiming | undefined {
  if (!startTime) return undefined;

  const tz = opts.timezone ?? getUserTimezone();
  const now = opts.now ?? new Date();
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return undefined;

  const startsInMs = start.getTime() - now.getTime();
  const stale = statusState === 'pre' && startsInMs < -30 * MINUTE;
  const imminent = statusState === 'pre' && startsInMs >= 0 && startsInMs <= 15 * MINUTE;

  return {
    startTime,
    timezone: tz,
    localStart: formatLocalTime(startTime, tz),
    localDateLabel: formatLocalDateLabel(startTime, now, tz),
    countdown: statusState === 'pre' ? formatCountdown(startsInMs) : undefined,
    startsInMs,
    proofed: opts.proofed ?? false,
    source: opts.source,
    stale,
    imminent,
  };
}

export function resolveGameClock(
  game: {
    statusState?: 'pre' | 'in' | 'post';
    clock: string;
    timing?: GameTiming;
  },
  now = new Date(),
): string {
  const { statusState, clock, timing } = game;

  if (statusState === 'in' || statusState === 'post') return clock;

  if (statusState === 'pre' && timing?.startTime) {
    const startsInMs = new Date(timing.startTime).getTime() - now.getTime();

    if (timing.stale || startsInMs < -30 * MINUTE) {
      return timing.localStart;
    }

    if (startsInMs > 0 && startsInMs <= 15 * MINUTE) {
      return formatCountdown(startsInMs);
    }

    if (startsInMs > 0 && startsInMs < 24 * HOUR) {
      return `${formatCountdown(startsInMs)} · ${timing.localStart}`;
    }

    if (timing.localDateLabel === 'Today') {
      return `${timing.localStart} · ${formatCountdown(startsInMs)}`;
    }

    if (timing.localDateLabel === 'Tomorrow') {
      return `Tomorrow ${timing.localStart}`;
    }

    return `${timing.localDateLabel} ${timing.localStart}`;
  }

  return clock;
}

export function enrichGameWithTiming(
  game: { statusState?: 'pre' | 'in' | 'post'; clock: string; timing?: GameTiming },
  candidates: StartTimeCandidate[],
  now = new Date(),
): { timing?: GameTiming; clock: string } {
  const { startTime, proofed, source } = proofStartTime(candidates);
  const timing = buildGameTiming(startTime, game.statusState, { proofed, source, now });
  const clock = resolveGameClock({ ...game, timing }, now);
  return { timing, clock };
}

export function refreshGameTiming<T extends { statusState?: 'pre' | 'in' | 'post'; clock: string; timing?: GameTiming }>(
  game: T,
  now = new Date(),
): T {
  if (!game.timing?.startTime) return game;
  const timing = buildGameTiming(game.timing.startTime, game.statusState, {
    proofed: game.timing.proofed,
    source: game.timing.source,
    now,
    timezone: game.timing.timezone,
  });
  return {
    ...game,
    timing,
    clock: resolveGameClock({ ...game, timing }, now),
  };
}

export function refreshAllGameTimings<T extends { statusState?: 'pre' | 'in' | 'post'; clock: string; timing?: GameTiming }>(
  games: T[],
  now = new Date(),
): T[] {
  return games.map((g) => refreshGameTiming(g, now));
}
