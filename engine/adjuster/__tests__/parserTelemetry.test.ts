import { describe, expect, it, beforeEach } from 'vitest';
import { parseEventsForSport } from '../../../services/parsers/parseGameEvent';
import { parseFightEvents } from '../../../services/parsers/parseFightEvents';
import { parseGolfEvents } from '../../../services/parsers/parseGolfEvents';
import { parseTennisEvents } from '../../../services/parsers/parseTennisEvents';
import { loadGoldenFixture } from '../fixtureTestUtils';
import { getParseBatchHistory, resetParseTelemetry } from '../telemetry';

describe('parser telemetry wiring', () => {
  beforeEach(() => {
    resetParseTelemetry();
  });

  it('records BASKETBALL batch from parseEventsForSport', () => {
    const fixture = loadGoldenFixture('basketball/live-standard.json');
    parseEventsForSport([fixture], 'BASKETBALL');
    const history = getParseBatchHistory('BASKETBALL');
    expect(history).toHaveLength(1);
    expect(history[0].parsedCount).toBeGreaterThan(0);
    expect(history[0].rawCount).toBe(1);
  });

  it('records WNBA telemetry override from parseEventsForSport', () => {
    const fixture = loadGoldenFixture('basketball/wnba-league-meta.json');
    parseEventsForSport([fixture], 'BASKETBALL', { telemetrySport: 'WNBA' });
    expect(getParseBatchHistory('WNBA')).toHaveLength(1);
    expect(getParseBatchHistory('BASKETBALL')).toHaveLength(0);
  });

  it('records TENNIS batch from parseTennisEvents', () => {
    const fixture = loadGoldenFixture('tennis/atp-match.json');
    parseTennisEvents([fixture], 'ATP');
    const history = getParseBatchHistory('TENNIS');
    expect(history).toHaveLength(1);
    expect(history[0].parsedCount).toBeGreaterThan(0);
    expect(history[0].rawCount).toBeGreaterThan(0);
  });

  it('records GOLF batch from parseGolfEvents', () => {
    const fixture = loadGoldenFixture('golf/pga-tournament.json');
    parseGolfEvents([fixture], 'PGA');
    const history = getParseBatchHistory('GOLF');
    expect(history).toHaveLength(1);
    expect(history[0].parsedCount).toBe(1);
    expect(history[0].rawCount).toBe(1);
  });

  it('records FIGHTS batch from parseFightEvents', () => {
    const fixture = loadGoldenFixture('fights/ufc-bout-pre.json');
    parseFightEvents([fixture], 'UFC');
    const history = getParseBatchHistory('FIGHTS');
    expect(history).toHaveLength(1);
    expect(history[0].parsedCount).toBeGreaterThan(0);
    expect(history[0].rawCount).toBeGreaterThan(0);
  });
});
