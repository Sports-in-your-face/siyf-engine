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
