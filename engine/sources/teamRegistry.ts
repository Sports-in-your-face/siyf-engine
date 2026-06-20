import { CORE_SOCCER_LEAGUES } from '../core/coreSoccerLeagues';
import { fetchCdnJson, resolveCdnAsset, type CdnTeamSport } from '../../config/siyfCdn';
import type { ResolvedTeam } from '../core/types';
import { espnSoccerTeams, parseEspnSoccerTeamsList } from './espnSoccerSource';

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

const espnSoccerTeamsBySlug = new Map<string, ResolvedTeam[]>();
const espnSoccerTeamLoads = new Map<string, Promise<void>>();

async function loadEspnSoccerTeamsForSlug(slug: string): Promise<void> {
  if (espnSoccerTeamsBySlug.has(slug)) return;
  if (!espnSoccerTeamLoads.has(slug)) {
    espnSoccerTeamLoads.set(slug, (async () => {
      const raw = await espnSoccerTeams(slug);
      const teams = raw ? parseEspnSoccerTeamsList(raw, slug) : [];
      espnSoccerTeamsBySlug.set(slug, teams);
    })().catch(() => {
      espnSoccerTeamsBySlug.set(slug, []);
    }));
  }
  await espnSoccerTeamLoads.get(slug);
}

export async function ensureEspnSoccerTeamRegistries(): Promise<void> {
  await Promise.all(CORE_SOCCER_LEAGUES.map(({ slug }) => loadEspnSoccerTeamsForSlug(slug)));
}

function resolveFromEspnSoccerTeams(query: string): ResolvedTeam | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  for (const teams of espnSoccerTeamsBySlug.values()) {
    for (const team of teams) {
      if (
        team.abbr.toLowerCase() === q
        || team.name.toLowerCase() === q
        || team.city.toLowerCase() === q
        || team.espnId === query
      ) {
        return team;
      }
    }
  }
  return undefined;
}

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
    ensureEspnSoccerTeamRegistries(),
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

// Soccer — ESPN teams across six core leagues, with EPL CDN fallback
export function normalizeSoccerTeamAbbr(abbr: string): string {
  return resolveFromEspnSoccerTeams(abbr)?.abbr
    ?? resolveFromRegistry('epl', abbr)?.abbr
    ?? abbr.toUpperCase().trim();
}

export function getAllSoccerTeams(): ResolvedTeam[] {
  const espnTeams = [...espnSoccerTeamsBySlug.values()].flat();
  const cdnTeams = getAllFromRegistry('epl');
  const teams = [...espnTeams, ...cdnTeams];
  return teams.filter(
    (t, i, arr) => arr.findIndex((x) => x.id === t.id && x.leagueSlug === t.leagueSlug) === i,
  );
}

export function resolveSoccerTeam(query: string): ResolvedTeam | undefined {
  return resolveFromEspnSoccerTeams(query) ?? resolveFromRegistry('epl', query);
}

export function resolveSoccerTeamLogo(abbr: string, existing?: string): string {
  const fromEspn = resolveFromEspnSoccerTeams(abbr)?.logo;
  if (fromEspn) return fromEspn;
  return resolveTeamLogoFor('epl', abbr, existing);
}

export function enrichSoccerTeam(
  abbr: string,
  partial: Partial<ResolvedTeam> & { name?: string; logo?: string },
): ResolvedTeam {
  const fromEspn = resolveFromEspnSoccerTeams(abbr);
  if (fromEspn) {
    return {
      ...fromEspn,
      ...partial,
      abbr: fromEspn.abbr,
      name: partial.name ?? fromEspn.name,
      logo: partial.logo ?? fromEspn.logo,
    };
  }
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

type TeamEnricher = (abbr: string, partial: Partial<ResolvedTeam> & { name?: string; logo?: string }) => ResolvedTeam;
type LogoResolver = (abbr: string, existing?: string) => string;

const ENGINE_SPORT_ENRICHERS: Partial<Record<import('../sportConfig').EngineSport, TeamEnricher>> = {
  BASKETBALL: enrichTeam,
  FOOTBALL: enrichNflTeam,
  SOCCER: enrichSoccerTeam,
  BASEBALL: enrichMlbTeam,
  HOCKEY: enrichNhlTeam,
};

const ENGINE_SPORT_LOGO_RESOLVERS: Partial<Record<import('../sportConfig').EngineSport, LogoResolver>> = {
  BASKETBALL: resolveTeamLogo,
  FOOTBALL: resolveNflTeamLogo,
  SOCCER: resolveSoccerTeamLogo,
  BASEBALL: resolveMlbTeamLogo,
  HOCKEY: resolveNhlTeamLogo,
};

/** Sport-aware team enrichment — avoids WSH/NBA vs WSH/MLB collisions. */
export function enrichTeamForSport(
  sport: import('../sportConfig').EngineSport,
  abbr: string,
  partial: Partial<ResolvedTeam> & { name?: string; logo?: string },
): ResolvedTeam {
  const enrich = ENGINE_SPORT_ENRICHERS[sport];
  if (!enrich) {
    return {
      id: partial.id ?? abbr,
      name: partial.name ?? abbr,
      abbr,
      city: partial.city ?? '',
      logo: partial.logo ?? '',
      color: partial.color,
      alternateColor: partial.alternateColor,
    };
  }
  return enrich(abbr, partial);
}

export function resolveTeamLogoForSport(
  sport: import('../sportConfig').EngineSport,
  abbr: string,
  existing?: string,
): string {
  const resolve = ENGINE_SPORT_LOGO_RESOLVERS[sport];
  if (!resolve) return existing ?? '';
  return resolve(abbr, existing);
}

export function normalizeAbbrForSport(
  sport: import('../sportConfig').EngineSport | undefined,
  abbr: string,
): string {
  switch (sport) {
    case 'BASEBALL': return normalizeMlbTeamAbbr(abbr);
    case 'FOOTBALL': return normalizeNflTeamAbbr(abbr);
    case 'HOCKEY': return normalizeAbbrFor('nhl', abbr);
    case 'SOCCER': return normalizeSoccerTeamAbbr(abbr);
    case 'BASKETBALL':
    default: return normalizeTeamAbbr(abbr);
  }
}

export function leagueLabel(slug: string): string {
  return soccerLeagueLabels[slug]
    ?? CORE_SOCCER_LEAGUES.find((l) => l.slug === slug)?.label
    ?? slug.replace(/\./g, ' ').toUpperCase();
}

export { loadSoccerLeagueLabels };
