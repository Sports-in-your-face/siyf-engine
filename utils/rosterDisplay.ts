import type { SportType } from '../services/api';
import type { Player, StatItem } from '../types';

export interface RosterPositionGroup {
  label: string;
  players: Player[];
}

const NFL_OFFENSE = new Set(['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'G', 'T', 'OL']);
const NFL_DEFENSE = new Set(['DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'FS', 'SS', 'DB', 'DL', 'EDGE']);
const NFL_SPECIAL = new Set(['K', 'P', 'LS', 'PK']);

const NHL_FORWARD = new Set(['C', 'LW', 'RW', 'F', 'W']);
const NHL_DEFENSE = new Set(['D', 'LD', 'RD']);
const NHL_GOALIE = new Set(['G', 'GK']);

const MLB_PITCHER = new Set(['P', 'SP', 'RP', 'CP', 'LHP', 'RHP']);

function normalizePosition(position: string): string {
  return position.trim().toUpperCase().split(/[\s,/·-]/)[0] ?? position;
}

function bucketForSport(sport: SportType, position: string): string {
  const pos = normalizePosition(position);
  if (sport === 'FOOTBALL') {
    if (NFL_OFFENSE.has(pos)) return 'Offense';
    if (NFL_DEFENSE.has(pos)) return 'Defense';
    if (NFL_SPECIAL.has(pos)) return 'Special Teams';
    return 'Roster';
  }
  if (sport === 'HOCKEY') {
    if (NHL_GOALIE.has(pos)) return 'Goalies';
    if (NHL_DEFENSE.has(pos)) return 'Defense';
    if (NHL_FORWARD.has(pos)) return 'Forwards';
    return 'Skaters';
  }
  if (sport === 'BASEBALL') {
    if (MLB_PITCHER.has(pos)) return 'Pitchers';
    return 'Position Players';
  }
  if (sport === 'SOCCER') {
    if (/GK|G/.test(pos)) return 'Goalkeepers';
    if (/D|DF|CB|LB|RB|WB/.test(pos)) return 'Defenders';
    if (/M|MF|CM|DM|AM|LM|RM/.test(pos)) return 'Midfielders';
    if (/F|FW|ST|CF|LW|RW|W/.test(pos)) return 'Forwards';
    return 'Squad';
  }
  if (sport === 'BASKETBALL') {
    if (/PG|G/.test(pos)) return 'Guards';
    if (/SF|SG|F|GF/.test(pos)) return 'Wings';
    if (/PF|C/.test(pos)) return 'Bigs';
    return 'Roster';
  }
  return position || 'Roster';
}

const GROUP_ORDER: Partial<Record<SportType, string[]>> = {
  BASKETBALL: ['Guards', 'Wings', 'Bigs', 'Roster'],
  FOOTBALL: ['Offense', 'Defense', 'Special Teams', 'Roster'],
  HOCKEY: ['Forwards', 'Defense', 'Goalies', 'Skaters'],
  BASEBALL: ['Pitchers', 'Position Players'],
  SOCCER: ['Goalkeepers', 'Defenders', 'Midfielders', 'Forwards', 'Squad'],
};

export function groupRosterByPosition(players: Player[], sport: SportType): RosterPositionGroup[] {
  const buckets = new Map<string, Player[]>();
  for (const player of players) {
    const label = bucketForSport(sport, player.position);
    const list = buckets.get(label) ?? [];
    list.push(player);
    buckets.set(label, list);
  }

  const order = GROUP_ORDER[sport] ?? [];
  const labels = [
    ...order.filter((label) => buckets.has(label)),
    ...[...buckets.keys()].filter((label) => !order.includes(label)).sort(),
  ];

  return labels.map((label) => ({
    label,
    players: sortRosterPlayers(buckets.get(label) ?? [], sport),
  }));
}

function jerseyNum(n?: string): number {
  const parsed = parseInt(String(n ?? ''), 10);
  return Number.isNaN(parsed) ? 999 : parsed;
}

export function sortRosterPlayers(players: Player[], _sport: SportType): Player[] {
  return [...players].sort((a, b) => {
    const num = jerseyNum(a.number) - jerseyNum(b.number);
    if (num !== 0) return num;
    return a.name.localeCompare(b.name);
  });
}

export function statValue(stats: StatItem[], label: string): string {
  const match = stats.find(
    (s) => s.label.toUpperCase() === label.toUpperCase()
      || s.label.replace(/\s/g, '') === label.replace(/\s/g, ''),
  );
  return match ? String(match.value) : '—';
}

export function visibleRosterStatColumns(
  players: Player[],
  columns: readonly string[],
): string[] {
  return columns.filter((label) =>
    players.some((p) => statValue(p.stats, label) !== '—'),
  );
}

export type InjurySeverity = 'out' | 'questionable' | 'other' | 'none';

export function classifyInjury(status?: string): InjurySeverity {
  if (!status) return 'none';
  const s = status.toLowerCase();
  if (/out|injur|ir|pup|susp|dtd|day.to.day/.test(s)) return 'out';
  if (/question|doubt|prob|gtd|limited/.test(s)) return 'questionable';
  return 'other';
}

export function cleanPositionLabel(position: string): string {
  const idx = position.indexOf('·');
  return idx >= 0 ? position.slice(0, idx).trim() : position;
}

export function playerPhysicalLine(player: Player): string | undefined {
  const parts: string[] = [];
  if (player.height) parts.push(player.height);
  if (player.weight) parts.push(player.weight);
  return parts.length ? parts.join(' · ') : undefined;
}
