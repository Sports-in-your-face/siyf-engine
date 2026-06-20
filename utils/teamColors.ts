import type { Team } from '../types';

export function isNearBlack(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return true;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r < 28 && g < 28 && b < 28;
}

export function formatTeamHex(hex?: string): string | undefined {
  if (!hex) return undefined;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

export function getTeamAccent(team: Pick<Team, 'color' | 'alternateColor'>): string {
  const primary = formatTeamHex(team.color);
  const alternate = formatTeamHex(team.alternateColor);
  if (primary && !isNearBlack(primary)) return primary;
  if (alternate) return alternate;
  return primary || '#4b5563';
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = formatTeamHex(hex)?.replace('#', '') ?? '4b5563';
  const safe = normalized.length >= 6 ? normalized.slice(0, 6) : '4b5563';
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getTeamAccentRgba(
  team: Pick<Team, 'color' | 'alternateColor'>,
  alpha: number,
): string {
  return hexToRgba(getTeamAccent(team), alpha);
}
