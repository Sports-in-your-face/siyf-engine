import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACTION_NETWORK_SMOKE_SOURCES,
  ESPN_SMOKE_SOURCES,
  MERGE_SMOKE_DEFINITIONS,
  SUPPLEMENTAL_SMOKE_SOURCES,
} from '../liveSmoke/sourceRegistry';
import {
  buildLiveSmokeReport,
  runLiveSmoke,
  runMergeSmoke,
  smokeParseRawScoreboard,
  writeLiveDriftReport,
} from '../liveSmoke/runLiveSmoke';
import { loadGoldenFixture } from '../fixtureTestUtils';
import { hasBlockingIssues } from '../invariants';
import { resetParseTelemetry } from '../telemetry';

const LIVE_ENABLED = process.env.SIYF_LIVE_DRIFT === '1';

describe('live smoke harness', () => {
  beforeEach(() => resetParseTelemetry());

  it('registry includes ESPN, Action Network, supplemental, and merge definitions', () => {
    expect(ESPN_SMOKE_SOURCES).toHaveLength(8);
    expect(ACTION_NETWORK_SMOKE_SOURCES).toHaveLength(4);
    expect(SUPPLEMENTAL_SMOKE_SOURCES).toHaveLength(2);
    expect(MERGE_SMOKE_DEFINITIONS).toHaveLength(4);
    for (const src of [...ESPN_SMOKE_SOURCES, ...ACTION_NETWORK_SMOKE_SOURCES]) {
      expect(src.endpoint).toMatch(/^\/api\//);
    }
  });

  it('builds a multi-source drift report from offline fixtures', () => {
    const espn = smokeParseRawScoreboard(
      'BASKETBALL',
      { events: [loadGoldenFixture('basketball/live-standard.json')] },
    );
    const tennis = smokeParseRawScoreboard(
      'TENNIS',
      { events: [loadGoldenFixture('tennis/atp-match.json')] },
    );

    const json = buildLiveSmokeReport([espn, tennis]);
    const report = JSON.parse(json);

    expect(report.generatedAt).toBeTruthy();
    expect(report.sources).toHaveLength(2);
    expect(report.summary).toHaveLength(2);
    expect(report.summary.every((row: { healthy: boolean }) => row.healthy)).toBe(true);
  });

  it('parses tennis competitors with flat name field', () => {
    const raw = {
      events: [{
        id: 't-live',
        name: 'Live Event',
        status: { type: { state: 'post' } },
        groupings: [{
          competitions: [{
            id: 'c-live',
            competitors: [
              { order: 1, name: 'Player A', score: '6-4' },
              { order: 2, name: 'Player B', score: '4-6' },
            ],
          }],
        }],
      }],
    };

    const result = smokeParseRawScoreboard('TENNIS', raw);
    expect(result.status).toBe('ok');
    expect(result.report?.healthy).toBe(true);
    expect(hasBlockingIssues(result.report?.issues ?? [])).toBe(false);
  });

  it('writes drift report JSON with merge section', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'siyf-drift-'));
    const file = path.join(dir, 'drift-test.json');
    const result = smokeParseRawScoreboard(
      'BASKETBALL',
      { events: [loadGoldenFixture('basketball/live-standard.json')] },
    );

    const written = await writeLiveDriftReport([result], [], file);
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(written).toBe(file);
    expect(saved.sources[0].id).toBe('espn-basketball');
    expect(saved.merges).toEqual([]);
  });
});

describe.skipIf(!LIVE_ENABLED)('live multi-source upstream', () => {
  beforeEach(() => resetParseTelemetry());

  it(
    'smokes ESPN + Action Network + supplemental + merge and writes drift report',
    async () => {
      const [results, merges] = await Promise.all([
        runLiveSmoke({ includeAggregate: true }),
        runMergeSmoke(),
      ]);
      const reportPath = await writeLiveDriftReport(results, merges);

      console.log(`[live-smoke] report → ${reportPath}`);
      console.log(`[live-smoke] sources=${results.length} merges=${merges.length}`);

      const blockingFetchFailures = results.filter((r) => {
        if (r.status !== 'fetch_failed') return false;
        // NCAA off-season 404 is classified as skipped; anything else is blocking.
        return true;
      });
      expect(blockingFetchFailures, JSON.stringify(blockingFetchFailures, null, 2)).toEqual([]);

      const requiredSources = [
        'espn-basketball',
        'action-network-nba',
        'action-network-nfl',
        'action-network-mlb',
        'action-network-nhl',
      ];
      for (const id of requiredSources) {
        const row = results.find((r) => r.id === id);
        expect(row, `missing source ${id}`).toBeTruthy();
        expect(row!.status, `${id}: ${row!.reason}`).not.toBe('fetch_failed');
      }

      const active = results.filter((r) => r.status === 'ok');
      const skipped = results.filter((r) => r.status === 'skipped');
      console.log(`[live-smoke] active=${active.length} skipped=${skipped.length}`);

      if (!active.length) {
        console.warn('[live-smoke] no live data — off-season soft pass');
        return;
      }

      const unhealthySources = active.filter((r) => r.report && !r.report.healthy);
      const unhealthyMerges = merges.filter((m) => !m.healthy);

      if (unhealthySources.length) {
        console.error('[live-smoke] unhealthy sources:', unhealthySources.map((r) => ({
          id: r.id,
          parseRate: r.report?.metrics.parseRate,
          errors: r.report?.metrics.errorCount,
        })));
      }
      if (unhealthyMerges.length) {
        console.error('[live-smoke] unhealthy merges:', unhealthyMerges.map((m) => ({
          id: m.id,
          mergeIssues: m.mergeIssues.map((i) => i.code),
        })));
      }

      expect(unhealthySources.map((r) => r.id)).toEqual([]);
      expect(unhealthyMerges.map((m) => m.id)).toEqual([]);
    },
    240_000,
  );
});
