import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  mapYahooScoreboardGames,
  resolveYahooRef,
  getYahooScoreboardRoot,
} from '../yahooScoreboardSource';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.development/scoreboard.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

describe('resolveYahooRef', () => {
  it('resolves team logo data islands', () => {
    const board = getYahooScoreboardRoot(fixture);
    expect(board).toBeTruthy();
    const logo = resolveYahooRef(board!, ['teamLogo', 'mlb.t.19']);
    expect(typeof logo).toBe('string');
    expect(String(logo)).toContain('dodgers');
  });
});

describe('mapYahooScoreboardGames', () => {
  it('maps live MLB games from the Yahoo scoreboard fixture', () => {
    const games = mapYahooScoreboardGames(fixture, 'BASEBALL');
    expect(games.length).toBeGreaterThan(0);

    const live = games.find((g) => g.away.abbr === 'TB' && g.home.abbr === 'LAD');
    expect(live).toBeTruthy();
    expect(live!.statusState).toBe('in');
    expect(live!.away.score).toBe(4);
    expect(live!.home.score).toBe(3);
    expect(live!.away.logo).toContain('rays');
    expect(live!.home.logo).toContain('dodgers');
    expect(live!.broadcast).toBe('RAYS');
  });

  it('maps live soccer games with elapsed clock', () => {
    const games = mapYahooScoreboardGames(fixture, 'SOCCER');
    expect(games.length).toBeGreaterThan(0);

    const live = games.find((g) => g.away.abbr === 'CRO' && g.home.abbr === 'ENG');
    expect(live).toBeTruthy();
    expect(live!.statusState).toBe('in');
    expect(live!.away.score).toBe(2);
    expect(live!.home.score).toBe(2);
    expect(live!.clock).toBe("45'");
    expect(live!.subtitle).toBe('World Cup');
  });

  it('ignores sports outside the requested engine tab', () => {
    const basketball = mapYahooScoreboardGames(fixture, 'BASKETBALL');
    expect(basketball).toHaveLength(0);
  });
});
