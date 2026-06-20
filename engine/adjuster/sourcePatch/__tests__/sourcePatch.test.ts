import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  espnScoreboardEndpointChain,
  probeEspnScoreboard,
  probeYahooScoreboard,
  yahooScoreboardEndpointChain,
} from '../index';
import {
  discoverEspnEventsArray,
  extractEspnEventsFromRaw,
  extractYahooScoreboardRoot,
} from '../schemaPaths';

const yahooFixture = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../../../.development/scoreboard.json'),
    'utf8',
  ),
);

describe('schemaPaths', () => {
  it('extracts ESPN events from canonical and wrapped shapes', () => {
    const events = [{ id: '1', competitions: [{ competitors: [] }] }];
    expect(extractEspnEventsFromRaw({ events })).toHaveLength(1);
    expect(extractEspnEventsFromRaw({ scoreboard: { events } })).toHaveLength(1);
    expect(discoverEspnEventsArray({ nested: { deep: { events } } })).toHaveLength(1);
  });

  it('extracts Yahoo scoreboard from fixture', () => {
    const board = extractYahooScoreboardRoot(yahooFixture);
    expect(board).toBeTruthy();
    expect(Object.keys(board!.games as object).length).toBeGreaterThan(0);
    expect(probeYahooScoreboard(yahooFixture)).toBe(true);
  });
});

describe('endpointRegistry', () => {
  it('builds ESPN chains with dated and v3 alternates', () => {
    const chain = espnScoreboardEndpointChain('BASKETBALL');
    expect(chain.length).toBeGreaterThan(2);
    expect(chain[0].url).toContain('/basketball/nba/scoreboard');
    expect(chain.some((c) => c.url.includes('dates='))).toBe(true);
  });

  it('builds Yahoo endpoint alternates', () => {
    const chain = yahooScoreboardEndpointChain();
    expect(chain.length).toBeGreaterThan(1);
    expect(chain[0].url).toContain('/api/yahoo/');
  });
});

describe('responseProbes', () => {
  it('accepts valid ESPN scoreboard payloads', () => {
    expect(probeEspnScoreboard({ events: [{ id: '1', competitions: [{}] }] })).toBe(true);
    expect(probeEspnScoreboard({ events: [] })).toBe(false);
  });
});
