import { fetchCdnJson, resolveCdnAsset, type CdnTeamSport } from '../../config/siyfCdn';
import type { ResolvedTeam } from '../core/types';

export type TeamRegistryKey = CdnTeamSport;

type AliasMap = Record<string, string>;

interface RegistryState {
  teams: ResolvedTeam[];
  aliases: Map<string, ResolvedTeam>;
}

const registries = new Map<TeamRegistryKey, RegistryState>();
const loadPromises = new Map<TeamRegistryKey, Promise<void>>();

let soccerLeagueLabels: Record<string, string> = {};
let soccerLabelsPromise: Promise<void> | null = null;

function normalizeAbbr(abbr: string): string {
  return abbr.toUpperCase().trim();
}

function normalizeTeamLogos(_key: TeamRegistryKey, teams: ResolvedTeam[]): ResolvedTeam[] {
  return teams.map((t) => ({
    ...t,
    logo: resolveCdnAsset(t.logo) || '',
  }));
}

function buildAliasMap(teams: ResolvedTeam[], extraAliases: AliasMap): Map<string, ResolvedTeam> {
  const map = new Map<string, ResolvedTeam>();

  for (const team of teams) {
    map.set(normalizeAbbr(team.abbr), team);
    if (team.espnId) map.set(normalizeAbbr(team.espnId), team);
    map.set(team.name.toLowerCase(), team);
    map.set(team.city.toLowerCase(), team);
  }

  for (const [alias, canonical] of Object.entries(extraAliases)) {
    const team = map.get(normalizeAbbr(canonical));
    if (team) map.set(normalizeAbbr(alias), team);
  }

  return map;
}

async function loadRegistry(key: TeamRegistryKey): Promise<void> {
  if (registries.has(key)) return;

  const [rawTeams, aliasBundle] = await Promise.all([
    fetchCdnJson<ResolvedTeam[]>(`teams/${key}.json`),
    fetchCdnJson<Partial<Record<TeamRegistryKey, AliasMap>>>('meta/team-aliases.json'),
  ]);

  const teams = normalizeTeamLogos(key, rawTeams);

  registries.set(key, {
    teams,
    aliases: buildAliasMap(teams, aliasBundle[key] ?? {}),
  });
}

export function ensureTeamRegistry(key: TeamRegistryKey): Promise<void> {
  if (registries.has(key)) return Promise.resolve();
  if (!loadPromises.has(key)) {
    loadPromises.set(key, loadRegistry(key).catch(() => undefined));
  }
  return loadPromises.get(key)!;
}

export async function preloadTeamRegistries(): Promise<void> {
  await Promise.all([
    ensureTeamRegistry('nba'),
    ensureTeamRegistry('nfl'),
    ensureTeamRegistry('epl'),
    ensureTeamRegistry('mlb'),
    ensureTeamRegistry('nhl'),
    loadSoccerLeagueLabels(),
  ]);
}

async function loadSoccerLeagueLabels(): Promise<void> {
  if (Object.keys(soccerLeagueLabels).length) return;
  if (!soccerLabelsPromise) {
    soccerLabelsPromise = fetchCdnJson<Record<string, string>>('meta/soccer-leagues.json')
      .then((labels) => {
        soccerLeagueLabels = labels;
      })
      .catch(() => undefined);
  }
  await soccerLabelsPromise;
}

function getRegistry(key: TeamRegistryKey): RegistryState | undefined {
  return registries.get(key);
}

function resolveFromRegistry(key: TeamRegistryKey, query: string): ResolvedTeam | undefined {
  const registry = getRegistry(key);
  if (!registry) return undefined;
  const normalized = normalizeAbbr(query);
  return registry.aliases.get(normalized) ?? registry.aliases.get(query.toLowerCase().trim());
}

function enrichFromRegistry(
  key: TeamRegistryKey,
  abbr: string,
  partial: Partial<ResolvedTeam> & { name?: string; logo?: string },
): ResolvedTeam {
  const registry = resolveFromRegistry(key, abbr);
  return {
    id: partial.id ?? registry?.id ?? abbr,
    espnId: partial.espnId ?? registry?.espnId,
    bdlId: partial.bdlId ?? registry?.bdlId,
    name: partial.name ?? registry?.name ?? abbr,
    abbr: registry?.abbr ?? abbr,
    city: partial.city ?? registry?.city ?? '',
    logo: resolveTeamLogoFor(key, abbr, partial.logo),
    color: partial.color ?? registry?.color,
    alternateColor: partial.alternateColor ?? registry?.alternateColor,
    conference: partial.conference ?? registry?.conference,
    division: partial.division ?? registry?.division,
  };
}

function isEspnAssetUrl(url: string): boolean {
  return /espncdn\.com/i.test(url);
}

function resolveTeamLogoFor(key: TeamRegistryKey, abbr: string, existing?: string): string {
  const registryTeam = resolveFromRegistry(key, abbr);
  const fromRegistry = registryTeam?.logo;
  if (fromRegistry) return fromRegistry;

  // No CDN match — keep the prior source (typically ESPN).
  if (existing) {
    if (isEspnAssetUrl(existing) || existing.startsWith('http://') || existing.startsWith('https://')) {
      return existing;
    }
    return resolveCdnAsset(existing) || existing;
  }

  return '';
}

function getAllFromRegistry(key: TeamRegistryKey): ResolvedTeam[] {
  return getRegistry(key)?.teams ?? [];
}

function normalizeAbbrFor(key: TeamRegistryKey, abbr: string): string {
  return resolveFromRegistry(key, abbr)?.abbr ?? abbr.toUpperCase().trim();
}

// NBA (default basketball registry)
export function normalizeTeamAbbr(abbr: string): string {
  return normalizeAbbrFor('nba', abbr);
}

export function getAllTeams(): ResolvedTeam[] {
  return getAllFromRegistry('nba');
}

export function resolveTeam(query: string): ResolvedTeam | undefined {
  return resolveFromRegistry('nba', query);
}

export function resolveTeamLogo(abbr: string, existing?: string): string {
  return resolveTeamLogoFor('nba', abbr, existing);
}

export function enrichTeam(
  abbr: string,
  partial: Partial<ResolvedTeam> & { name?: string; logo?: string },
): ResolvedTeam {
  return enrichFromRegistry('nba', abbr, partial);
}

// NFL
export function normalizeNflTeamAbbr(abbr: string): string {
  return normalizeAbbrFor('nfl', abbr);
}

export function getAllNflTeams(): ResolvedTeam[] {
  return getAllFromRegistry('nfl');
}

export function resolveNflTeam(query: string): ResolvedTeam | undefined {
  return resolveFromRegistry('nfl', query);
}

export function resolveNflTeamLogo(abbr: string, existing?: string): string {
  return resolveTeamLogoFor('nfl', abbr, existing);
}

export function enrichNflTeam(
  abbr: string,
  partial: Partial<ResolvedTeam> & { name?: string; logo?: string },
): ResolvedTeam {
  return enrichFromRegistry('nfl', abbr, partial);
}

// Soccer / EPL
export function normalizeSoccerTeamAbbr(abbr: string): string {
  return normalizeAbbrFor('epl', abbr);
}

export function getAllSoccerTeams(): ResolvedTeam[] {
  const teams = getAllFromRegistry('epl');
  return teams.filter((t, i, arr) => arr.findIndex((x) => x.abbr === t.abbr) === i);
}

export function resolveSoccerTeam(query: string): ResolvedTeam | undefined {
  return resolveFromRegistry('epl', query);
}

export function resolveSoccerTeamLogo(abbr: string, existing?: string): string {
  return resolveTeamLogoFor('epl', abbr, existing);
}

export function enrichSoccerTeam(
  abbr: string,
  partial: Partial<ResolvedTeam> & { name?: string; logo?: string },
): ResolvedTeam {
  return enrichFromRegistry('epl', abbr, partial);
}

// MLB
export function normalizeMlbTeamAbbr(abbr: string): string {
  return normalizeAbbrFor('mlb', abbr);
}

export function resolveMlbTeam(query: string): ResolvedTeam | undefined {
  return resolveFromRegistry('mlb', query);
}

export function enrichMlbTeam(
  abbr: string,
  partial: Partial<ResolvedTeam> & { name?: string; logo?: string },
): ResolvedTeam {
  return enrichFromRegistry('mlb', abbr, partial);
}

// MLB / NHL (bookmark + legacy sport tabs)
export function getAllMlbTeams(): ResolvedTeam[] {
  return getAllFromRegistry('mlb');
}

export function getAllNhlTeams(): ResolvedTeam[] {
  return getAllFromRegistry('nhl');
}

export function resolveMlbTeamLogo(abbr: string, existing?: string): string {
  return resolveTeamLogoFor('mlb', abbr, existing);
}

export function resolveNhlTeamLogo(abbr: string, existing?: string): string {
  return resolveTeamLogoFor('nhl', abbr, existing);
}

export function enrichNhlTeam(
  abbr: string,
  partial: Partial<ResolvedTeam> & { name?: string; logo?: string },
): ResolvedTeam {
  return enrichFromRegistry('nhl', abbr, partial);
}

export function leagueLabel(slug: string): string {
  return soccerLeagueLabels[slug] ?? slug.replace(/\./g, ' ').toUpperCase();
}

export { loadSoccerLeagueLabels };
