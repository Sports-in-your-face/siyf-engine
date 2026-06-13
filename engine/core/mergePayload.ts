import type { Game, GameContext, Player, PlayerDetails, PlayerSeasonRow, StatItem } from '../../types';
import type { ResolvedTeam, StandingsGroup } from './types';
import { mergeContext } from '../../services/parsers/parseBasketballContext';
import { dedupeRumors } from './rssRumorUtils';

export function mergePlayerDetails(base: PlayerDetails, patch: Partial<PlayerDetails>): PlayerDetails {
  return {
    ...base,
    name: base.name || patch.name || base.name,
    team: base.team || patch.team || base.team,
    position: base.position || patch.position || base.position,
    number: base.number ?? patch.number,
    height: base.height ?? patch.height,
    weight: base.weight ?? patch.weight,
    headshot: base.headshot ?? patch.headshot,
    debutYear: base.debutYear ?? patch.debutYear,
    injuryStatus: patch.injuryStatus ?? base.injuryStatus,
    teamAccent: base.teamAccent ?? patch.teamAccent,
    heroStats: base.heroStats.length >= 4 ? base.heroStats : (patch.heroStats?.length ? patch.heroStats : base.heroStats),
    seasonSplits: base.seasonSplits.length
      ? mergeSeasonSplits(base.seasonSplits, patch.seasonSplits)
      : (patch.seasonSplits?.length ? patch.seasonSplits : base.seasonSplits),
    seasonHistory: base.seasonHistory.length ? base.seasonHistory : (patch.seasonHistory?.length ? patch.seasonHistory : base.seasonHistory),
    recentGames: base.recentGames.length ? base.recentGames : (patch.recentGames?.length ? patch.recentGames : base.recentGames),
    awards: base.awards.length ? base.awards : (patch.awards?.length ? patch.awards : base.awards),
    rumors: dedupeRumors([...(base.rumors ?? []), ...(patch.rumors ?? [])]),
  };
}

function mergeSeasonSplits(
  a: PlayerDetails['seasonSplits'],
  b: PlayerDetails['seasonSplits'] | undefined,
): PlayerDetails['seasonSplits'] {
  if (!b?.length) return a;
  const names = new Set(a.map((s) => s.name));
  const merged = [...a];
  for (const split of b) {
    if (!names.has(split.name)) merged.push(split);
  }
  return merged;
}

export function mergeStandingsGroups(primary: StandingsGroup[], extra: StandingsGroup[]): StandingsGroup[] {
  if (!extra.length) return primary;
  if (!primary.length) return extra;
  const map = new Map(primary.map((g) => [g.name, { ...g, rows: [...g.rows] }]));
  for (const group of extra) {
    const existing = map.get(group.name);
    if (!existing) {
      map.set(group.name, group);
      continue;
    }
    const seen = new Set(existing.rows.map((r) => r.team.abbr));
    for (const row of group.rows) {
      if (!seen.has(row.team.abbr)) existing.rows.push(row);
    }
  }
  return Array.from(map.values());
}

export function mergeRosterPlayers(primary: Player[], extra: Player[]): Player[] {
  const map = new Map(primary.map((p) => [p.id, p]));
  for (const p of extra) {
    const existing = map.get(p.id);
    if (!existing) {
      map.set(p.id, p);
      continue;
    }
    map.set(p.id, {
      ...existing,
      ...p,
      stats: existing.stats.length ? existing.stats : p.stats,
      position: p.position !== '—' ? p.position : existing.position,
    });
  }
  return Array.from(map.values());
}

export function mergeTeams(primary: ResolvedTeam[], extra: ResolvedTeam[]): ResolvedTeam[] {
  const map = new Map(primary.map((t) => [t.abbr, { ...t }]));
  for (const t of extra) {
    const existing = map.get(t.abbr);
    if (!existing) {
      map.set(t.abbr, t);
      continue;
    }
    map.set(t.abbr, {
      ...existing,
      ...t,
      logo: existing.logo || t.logo,
      note: t.note ?? existing.note,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function enrichGameContext(game: Game, patch: Partial<GameContext>): Game {
  const ctx = mergeContext(game.context, patch);
  return {
    ...game,
    context: ctx,
    subtitle: patch.headline ?? game.subtitle,
  };
}

export function appendHeroStat(stats: StatItem[], label: string, value: string | number): StatItem[] {
  if (stats.some((s) => s.label === label)) return stats;
  return [...stats, { label, value }];
}

export function mergeSeasonHistory(primary: PlayerSeasonRow[], extra: PlayerSeasonRow[]): PlayerSeasonRow[] {
  if (!extra.length) return primary;
  if (!primary.length) return extra;
  const seen = new Set(primary.map((r) => r.season));
  return [...primary, ...extra.filter((r) => !seen.has(r.season))];
}
