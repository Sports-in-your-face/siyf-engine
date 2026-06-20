import { cdnUrl } from './siyfCdn';

export interface SoccerLeagueLogoAsset {
  slug: string;
  label: string;
  /** Stable ESPN league badge — used as fallback when CDN/local bundle is unavailable. */
  espnLogo: string;
  cdnPath: string;
}

export const SOCCER_LEAGUE_LOGO_ASSETS: readonly SoccerLeagueLogoAsset[] = [
  { slug: 'usa.1', label: 'MLS', espnLogo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png', cdnPath: 'media/logos/leagues/soccer/usa.1.png' },
  { slug: 'eng.1', label: 'EPL', espnLogo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png', cdnPath: 'media/logos/leagues/soccer/eng.1.png' },
  { slug: 'esp.1', label: 'La Liga', espnLogo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png', cdnPath: 'media/logos/leagues/soccer/esp.1.png' },
  { slug: 'ger.1', label: 'Bundesliga', espnLogo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png', cdnPath: 'media/logos/leagues/soccer/ger.1.png' },
  { slug: 'ita.1', label: 'Serie A', espnLogo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png', cdnPath: 'media/logos/leagues/soccer/ita.1.png' },
  { slug: 'fra.1', label: 'Ligue 1', espnLogo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png', cdnPath: 'media/logos/leagues/soccer/fra.1.png' },
] as const;

const bySlug = new Map(SOCCER_LEAGUE_LOGO_ASSETS.map((a) => [a.slug, a]));

/** Bundled extension assets (Vite public/). */
export function bundledSoccerLeagueLogo(slug: string): string {
  return `/media/soccer-leagues/${slug}.png`;
}

export function soccerLeagueLogoAsset(slug: string): SoccerLeagueLogoAsset | undefined {
  return bySlug.get(slug);
}

/** Primary CDN URL for a league badge. */
export function cdnSoccerLeagueLogo(slug: string): string {
  const asset = bySlug.get(slug);
  return asset ? cdnUrl(asset.cdnPath) : '';
}

/** Ordered logo sources: CDN → bundled → ESPN. */
export function soccerLeagueLogoSources(slug: string): { src: string; fallbackSrc?: string } {
  const asset = bySlug.get(slug);
  if (!asset) return { src: '' };
  return {
    src: cdnUrl(asset.cdnPath),
    fallbackSrc: bundledSoccerLeagueLogo(slug),
  };
}

export function soccerLeagueLogoEspnFallback(slug: string): string {
  return bySlug.get(slug)?.espnLogo ?? '';
}
