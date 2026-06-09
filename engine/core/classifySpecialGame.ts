import type { Game, SpecialGameConfidence, SpecialGameExplanation, SpecialGameInfo, SpecialGameKind } from '../../types';
import { cdnUrl } from '../../config/siyfCdn';
import { matchCuratedEvent } from './specialGameCatalog';

const MARQUEE_KINDS = new Set<SpecialGameKind>([
  'super_bowl',
  'world_series',
  'nba_finals',
  'wnba_finals',
  'all_star',
  'world_cup',
  'euro',
  'copa_america',
  'champions_league_final',
  'europa_league_final',
  'fa_cup_final',
  'league_cup_final',
]);

interface RuleHit {
  kind: SpecialGameKind;
  weight: number;
  label: string;
  source: string;
  signal: string;
}

interface PatternRule {
  kind: SpecialGameKind;
  label: string;
  patterns: RegExp[];
  sports?: string[];
  weight: number;
  source: string;
}

const PATTERN_RULES: PatternRule[] = [
  {
    kind: 'super_bowl',
    label: 'Super Bowl',
    patterns: [/super\s*bowl/i],
    sports: ['FOOTBALL'],
    weight: 92,
    source: 'pattern:super_bowl',
  },
  {
    kind: 'world_series',
    label: 'World Series',
    patterns: [/world\s*series/i],
    sports: ['BASEBALL'],
    weight: 92,
    source: 'pattern:world_series',
  },
  {
    kind: 'nba_finals',
    label: 'NBA Finals',
    patterns: [/nba\s*finals/i],
    sports: ['BASKETBALL'],
    weight: 92,
    source: 'pattern:nba_finals',
  },
  {
    kind: 'wnba_finals',
    label: 'WNBA Finals',
    patterns: [/wnba\s*finals/i],
    sports: ['BASKETBALL'],
    weight: 90,
    source: 'pattern:wnba_finals',
  },
  {
    kind: 'all_star',
    label: 'All-Star Game',
    patterns: [/all[-\s]?star/i],
    weight: 88,
    source: 'pattern:all_star',
  },
  {
    kind: 'world_cup',
    label: 'FIFA World Cup',
    patterns: [/world\s*cup|fifa\s*world\s*cup/i],
    sports: ['SOCCER'],
    weight: 92,
    source: 'pattern:world_cup',
  },
  {
    kind: 'euro',
    label: 'UEFA Euro',
    patterns: [/\beuro\s*20\d{2}\b|\buefa\s*euro/i],
    sports: ['SOCCER'],
    weight: 88,
    source: 'pattern:euro',
  },
  {
    kind: 'copa_america',
    label: 'Copa América',
    patterns: [/copa\s*am[eé]rica/i],
    sports: ['SOCCER'],
    weight: 88,
    source: 'pattern:copa_america',
  },
  {
    kind: 'champions_league_final',
    label: 'Champions League Final',
    patterns: [/champions\s*league\s*final|ucl\s*final/i],
    sports: ['SOCCER'],
    weight: 90,
    source: 'pattern:ucl_final',
  },
  {
    kind: 'europa_league_final',
    label: 'Europa League Final',
    patterns: [/europa\s*league\s*final/i],
    sports: ['SOCCER'],
    weight: 85,
    source: 'pattern:uel_final',
  },
  {
    kind: 'fa_cup_final',
    label: 'FA Cup Final',
    patterns: [/fa\s*cup\s*final/i],
    sports: ['SOCCER'],
    weight: 85,
    source: 'pattern:fa_cup_final',
  },
  {
    kind: 'league_cup_final',
    label: 'League Cup Final',
    patterns: [/league\s*cup\s*final|carabao\s*cup\s*final/i],
    sports: ['SOCCER'],
    weight: 82,
    source: 'pattern:league_cup_final',
  },
  {
    kind: 'conference_final',
    label: 'Conference Final',
    patterns: [/conference\s*(championship|final)/i, /afc\s*championship/i, /nfc\s*championship/i],
    sports: ['FOOTBALL', 'BASKETBALL'],
    weight: 72,
    source: 'pattern:conference_final',
  },
  {
    kind: 'bowl_game',
    label: 'Bowl Game',
    patterns: [/\bbowl\b/i],
    sports: ['FOOTBALL'],
    weight: 65,
    source: 'pattern:bowl_game',
  },
  {
    kind: 'derby',
    label: 'Derby',
    patterns: [/\bderby\b|\bderbi\b/i],
    sports: ['SOCCER'],
    weight: 60,
    source: 'pattern:derby',
  },
];

const RIVALRY_HINTS: Array<{ pattern: RegExp; label: string; sport: string; weight: number }> = [
  { pattern: /manchester derby|north west derby/i, label: 'Manchester Derby', sport: 'SOCCER', weight: 62 },
  { pattern: /north london derby/i, label: 'North London Derby', sport: 'SOCCER', weight: 62 },
  { pattern: /el clasico|cl[aá]sico/i, label: 'El Clásico', sport: 'SOCCER', weight: 70 },
  { pattern: /lakers.*celtics|celtics.*lakers/i, label: 'Lakers vs Celtics', sport: 'BASKETBALL', weight: 58 },
  { pattern: /chiefs.*(raiders|broncos)|raiders.*chiefs/i, label: 'AFC West Rivalry', sport: 'FOOTBALL', weight: 55 },
  { pattern: /yankees.*red sox|red sox.*yankees/i, label: 'Yankees vs Red Sox', sport: 'BASEBALL', weight: 65 },
  { pattern: /dodgers.*giants|giants.*dodgers/i, label: 'Dodgers vs Giants', sport: 'BASEBALL', weight: 62 },
  { pattern: /cubs.*cardinals|cardinals.*cubs/i, label: 'Cubs vs Cardinals', sport: 'BASEBALL', weight: 60 },
];

function gatherSearchText(game: Game): string {
  const parts = [
    game.context?.headline,
    game.context?.round,
    game.context?.badge,
    game.subtitle,
    game.leagueSlug,
    game.status,
    game.away.name,
    game.home.name,
  ];
  return parts.filter(Boolean).join(' · ');
}

function scoreToConfidence(score: number): SpecialGameConfidence {
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  return 'low';
}

function isSpecialScore(kind: SpecialGameKind, score: number, confidence: SpecialGameConfidence): boolean {
  if (kind === 'regular') return false;
  if (MARQUEE_KINDS.has(kind)) return confidence !== 'low';
  if (kind === 'playoff' || kind === 'conference_final') return score >= 70;
  if (kind === 'rivalry' || kind === 'derby' || kind === 'bowl_game') return score >= 75;
  return score >= 80;
}

function contextHits(game: Game): RuleHit[] {
  const ctx = game.context;
  if (!ctx) return [];

  const hits: RuleHit[] = [];
  const sport = (game.sport ?? '').toUpperCase();

  if (ctx.phase === 'finals') {
    if (sport === 'FOOTBALL') {
      hits.push({
        kind: 'super_bowl',
        weight: ctx.round?.toLowerCase().includes('super bowl') ? 95 : 68,
        label: ctx.round ?? 'Super Bowl',
        source: 'context:finals',
        signal: `phase=finals sport=FOOTBALL round=${ctx.round ?? 'unknown'}`,
      });
    } else if (sport === 'BASKETBALL') {
      const wnba = /wnba/i.test(`${ctx.headline ?? ''} ${ctx.round ?? ''}`);
      hits.push({
        kind: wnba ? 'wnba_finals' : 'nba_finals',
        weight: /nba finals|wnba finals/i.test(`${ctx.headline ?? ''} ${ctx.round ?? ''}`) ? 94 : 72,
        label: ctx.round ?? (wnba ? 'WNBA Finals' : 'NBA Finals'),
        source: 'context:finals',
        signal: 'phase=finals sport=BASKETBALL',
      });
    } else if (sport === 'SOCCER') {
      const slug = game.leagueSlug ?? '';
      let kind: SpecialGameKind = 'playoff';
      let label = ctx.round ?? ctx.headline ?? 'Final';
      let weight = 70;

      if (slug.includes('uefa.champions')) {
        kind = 'champions_league_final';
        label = 'Champions League Final';
        weight = 88;
      } else if (slug.includes('uefa.europa')) {
        kind = 'europa_league_final';
        label = 'Europa League Final';
        weight = 84;
      } else if (slug.includes('eng.fa')) {
        kind = 'fa_cup_final';
        label = 'FA Cup Final';
        weight = 84;
      } else if (slug.includes('eng.league_cup')) {
        kind = 'league_cup_final';
        label = 'League Cup Final';
        weight = 82;
      }

      hits.push({
        kind,
        weight,
        label,
        source: 'context:finals',
        signal: `phase=finals league=${slug}`,
      });
    } else if (sport === 'BASEBALL') {
      hits.push({
        kind: 'world_series',
        weight: ctx.round?.toLowerCase().includes('world series') ? 95 : 68,
        label: ctx.round ?? 'World Series',
        source: 'context:finals',
        signal: `phase=finals sport=BASEBALL round=${ctx.round ?? 'unknown'}`,
      });
    }
  }

  if (ctx.phase === 'playoffs' || ctx.phase === 'play-in') {
    hits.push({
      kind: 'playoff',
      weight: ctx.phase === 'play-in' ? 58 : 62,
      label: ctx.round ?? ctx.badge ?? 'Playoffs',
      source: 'context:playoffs',
      signal: `phase=${ctx.phase}`,
    });
  }

  if (ctx.badge && /all[-\s]?star/i.test(ctx.badge)) {
    hits.push({
      kind: 'all_star',
      weight: 90,
      label: ctx.badge,
      source: 'context:badge',
      signal: `badge=${ctx.badge}`,
    });
  }

  return hits;
}

function patternHits(game: Game, text: string): RuleHit[] {
  const sport = (game.sport ?? '').toUpperCase();
  const hits: RuleHit[] = [];

  for (const rule of PATTERN_RULES) {
    if (rule.sports && !rule.sports.includes(sport)) continue;
    if (!rule.patterns.some((p) => p.test(text))) continue;
    hits.push({
      kind: rule.kind,
      weight: rule.weight,
      label: rule.label,
      source: rule.source,
      signal: `matched ${rule.patterns[0]}`,
    });
  }

  for (const rivalry of RIVALRY_HINTS) {
    if (rivalry.sport !== sport) continue;
    if (!rivalry.pattern.test(text)) continue;
    hits.push({
      kind: 'rivalry',
      weight: rivalry.weight,
      label: rivalry.label,
      source: 'pattern:rivalry',
      signal: rivalry.label,
    });
  }

  return hits;
}

function leagueSlugHits(game: Game): RuleHit[] {
  const slug = game.leagueSlug;
  if (!slug) return [];

  const hits: RuleHit[] = [];
  if (slug.includes('world.cup') || slug.includes('fifa.world')) {
    hits.push({
      kind: 'world_cup',
      weight: 90,
      label: 'FIFA World Cup',
      source: 'league_slug',
      signal: slug,
    });
  }
  if (slug.includes('uefa.euro')) {
    hits.push({
      kind: 'euro',
      weight: 88,
      label: 'UEFA Euro',
      source: 'league_slug',
      signal: slug,
    });
  }
  if (slug.includes('uefa.champions')) {
    hits.push({
      kind: 'champions_league_final',
      weight: game.context?.phase === 'finals' ? 90 : 55,
      label: 'UEFA Champions League',
      source: 'league_slug',
      signal: slug,
    });
  }
  return hits;
}

function pickBestHit(hits: RuleHit[]): RuleHit | null {
  if (!hits.length) return null;
  return hits.reduce((best, hit) => (hit.weight > best.weight ? hit : best));
}

function buildLabel(hit: RuleHit, game: Game): string {
  if (game.context?.headline && hit.weight < 90) {
    return game.context.headline;
  }
  if (game.context?.round && hit.kind !== 'regular') {
    return game.context.gameNumber
      ? `${game.context.round} · Game ${game.context.gameNumber}`
      : game.context.round;
  }
  if (game.context?.badge && hit.weight >= 85) {
    return game.context.badge;
  }
  return hit.label;
}

function finalizeInfo(
  hit: RuleHit,
  game: Game,
  sources: string[],
  eventLogo?: string,
): SpecialGameInfo {
  const score = Math.min(100, Math.round(hit.weight));
  const confidence = scoreToConfidence(score);
  const kind = hit.kind;
  const isSpecial = isSpecialScore(kind, score, confidence);

  return {
    kind,
    label: buildLabel(hit, game),
    confidence,
    score,
    isSpecial,
    cardVariant: isSpecial ? 'special' : undefined,
    eventLogo,
    sources,
  };
}

function defaultRegular(): SpecialGameInfo {
  return {
    kind: 'regular',
    label: 'Regular Season',
    confidence: 'high',
    score: 0,
    isSpecial: false,
    sources: ['default'],
  };
}

export function explainSpecialGame(game: Game, when = new Date()): SpecialGameExplanation {
  const text = gatherSearchText(game);
  const hits = [...contextHits(game), ...patternHits(game, text), ...leagueSlugHits(game)];

  const signals = hits.map((h) => ({ id: h.source, weight: h.weight, detail: h.signal }));
  const sources = [...new Set(hits.map((h) => h.source))];

  const curated = matchCuratedEvent(game.sport, text, when);
  if (curated) {
    hits.push({
      kind: curated.kind,
      weight: 96,
      label: curated.label,
      source: 'cdn_catalog',
      signal: curated.id,
    });
    signals.push({ id: 'cdn_catalog', weight: 96, detail: curated.id });
    sources.push('cdn_catalog');
  }

  const best = pickBestHit(hits);
  if (!best) {
    return { ...defaultRegular(), signals };
  }

  let eventLogo: string | undefined;
  if (curated?.logo && curated.enabled !== false) {
    const logo = curated.logo;
    eventLogo = logo.startsWith('http') ? logo : cdnUrl(logo);
  }

  const info = finalizeInfo(best, game, sources, eventLogo);

  if (eventLogo && info.confidence !== 'high') {
    delete info.eventLogo;
  }

  return { ...info, signals, matchedCatalogId: curated?.id };
}

export function classifySpecialGame(game: Game, when = new Date()): SpecialGameInfo {
  const { signals: _s, matchedCatalogId: _m, ...info } = explainSpecialGame(game, when);
  return info;
}

export function applySpecialClassification(game: Game, when = new Date()): Game {
  const special = classifySpecialGame(game, when);
  if (special.kind === 'regular' && !special.isSpecial) {
    if (!game.special) return game;
    const { special: _, ...rest } = game;
    return rest;
  }
  return { ...game, special };
}

export function applySpecialClassificationToGames(games: Game[], when = new Date()): Game[] {
  return games.map((g) => applySpecialClassification(g, when));
}

export function getSpecialGames(games: Game[]): Game[] {
  return games.filter((g) => g.special?.isSpecial);
}
