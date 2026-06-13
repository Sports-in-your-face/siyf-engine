const ESPN_MMA_HEADSHOT_BASE = 'https://a.espncdn.com/i/headshots/mma/players/full';
const ESPN_TENNIS_HEADSHOT_BASE = 'https://a.espncdn.com/i/headshots/tennis/players/full';

/** ESPN headshot CDN only works with plain numeric athlete IDs — not composite or negative ids. */
function isValidEspnHeadshotId(id: unknown): boolean {
  if (id == null || id === '') return false;
  const s = String(id).trim();
  return /^\d+$/.test(s) && s !== '0';
}

export function buildMmaHeadshotUrl(athleteId?: string | number | null): string | undefined {
  if (!isValidEspnHeadshotId(athleteId)) return undefined;
  return `${ESPN_MMA_HEADSHOT_BASE}/${athleteId}.png`;
}

export function buildTennisHeadshotUrl(athleteId?: string | number | null): string | undefined {
  if (!isValidEspnHeadshotId(athleteId)) return undefined;
  return `${ESPN_TENNIS_HEADSHOT_BASE}/${athleteId}.png`;
}

/** Two-letter initials for fighter/athlete avatar fallbacks. */
export function fighterInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/** Prefer explicit headshot URL, then ESPN CDN from athlete id. */
export function resolveFighterDisplayHeadshot(opts: {
  athleteId?: string | number | null;
  headshot?: string | null;
}): string | undefined {
  if (opts.headshot) return opts.headshot;
  return buildMmaHeadshotUrl(opts.athleteId);
}

export function isCountryFlagUrl(url?: string): boolean {
  return Boolean(url && /teamlogos\/countries\//i.test(url));
}

export function isPlaceholderCompetitor(competitor: { name?: string; abbr?: string }): boolean {
  const label = (competitor.abbr || competitor.name || '').trim().toUpperCase();
  return label === 'TBD' || label === 'TBA' || label === '—' || label === '-';
}

export interface IndividualAthleteAssets {
  headshot?: string;
  flag?: string;
  logoFallback?: string;
}

type AthleteComp = {
  id?: string | number;
  athlete?: {
    id?: string | number;
    headshot?: { href?: string } | string;
    flag?: { href?: string };
  };
};

function headshotFromAthlete(athlete: AthleteComp['athlete']): string | undefined {
  if (!athlete?.headshot) return undefined;
  return typeof athlete.headshot === 'object' ? athlete.headshot.href : athlete.headshot;
}

export function resolveMmaFighterAssets(comp: AthleteComp): IndividualAthleteAssets {
  const athlete = comp.athlete ?? {};
  const athleteId = comp.id ?? athlete.id;
  const flag = athlete.flag?.href;
  const headshot = headshotFromAthlete(athlete) ?? buildMmaHeadshotUrl(athleteId);
  return { headshot: headshot ?? flag, flag, logoFallback: !headshot ? flag : undefined };
}

export function resolveTennisAthleteAssets(
  comp: AthleteComp,
  tour?: 'ATP' | 'WTA',
): IndividualAthleteAssets {
  const athlete = comp.athlete ?? {};
  const athleteId = comp.id ?? athlete.id;
  const flag = athlete.flag?.href;
  const headshotFromApi = headshotFromAthlete(athlete);
  // WTA ids differ from ESPN — headshots are resolved via wtaTennisSource enrichment.
  const headshot = headshotFromApi ?? (tour === 'ATP' ? buildTennisHeadshotUrl(athleteId) : undefined);
  return { headshot: headshot ?? flag, flag, logoFallback: !headshot ? flag : undefined };
}

/** Normalize stored team fields into separate headshot + flag for display. */
export function resolveCompetitorPortrait(competitor: {
  logo?: string;
  logoFallback?: string;
  flag?: string;
}): IndividualAthleteAssets {
  const explicitFlag = competitor.flag ?? competitor.logoFallback;
  const logoIsFlag = isCountryFlagUrl(competitor.logo);
  const flag = explicitFlag ?? (logoIsFlag ? competitor.logo : undefined);
  const headshot = competitor.logo && !logoIsFlag ? competitor.logo : undefined;
  return { headshot, flag };
}
