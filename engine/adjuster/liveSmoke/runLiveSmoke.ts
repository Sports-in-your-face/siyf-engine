import fs from 'node:fs/promises';
import path from 'node:path';
import type { Game } from '../../../types';
import type { SportType } from '../../../services/api';
import { buildDriftReport, type ParseBatchReport } from '../adjuster';
import { getDlqSnapshot } from '../dlq';
import { getChronoRecords, getRecentChronoTransitions } from '../chronoState';
import { getGovernorStats } from '../../core/apiGovernor';
import { fetchSupplementalFightScoreboards } from '../../sources/fightSupplementalFeeds';
import { fetchSupplementalSoccerScoreboards } from '../../sources/soccerSupplementalFeeds';
import { evaluateParseBatch } from './evaluateBatch';
import { simulateEspnActionNetworkMerge, type MergeSmokeResult } from './mergeSmoke';
import {
  parseActionNetworkSource,
  parseEspnSource,
  parseNcaaSource,
  parseWnbaEspnSource,
} from './parseSource';
import {
  ACTION_NETWORK_SMOKE_SOURCES,
  AGGREGATE_SMOKE_SOURCES,
  ESPN_SMOKE_SOURCES,
  getNcaaLiveEndpoint,
  MERGE_SMOKE_DEFINITIONS,
  SUPPLEMENTAL_SMOKE_SOURCES,
} from './sourceRegistry';
import { liveApiBase } from './sources';
import type { SourceSmokeDefinition, SourceSmokeResult, SourceSmokeStatus } from './types';

export type { SourceSmokeResult, SourceSmokeStatus } from './types';

export interface RunLiveSmokeOptions {
  apiBase?: string;
  fetchJson?: (url: string) => Promise<unknown>;
  timeoutMs?: number;
  includeMerge?: boolean;
  includeAggregate?: boolean;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

export async function fetchLiveJson(
  endpoint: string,
  options: { apiBase?: string; timeoutMs?: number; retries?: number } = {},
): Promise<unknown> {
  const base = (options.apiBase ?? liveApiBase()).replace(/\/$/, '');
  const url = endpoint.startsWith('http') ? endpoint : `${base}${endpoint}`;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retries = options.retries ?? 2;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = new Error(`${url} → HTTP ${res.status}`);
        if (attempt < retries && isRetryableStatus(res.status)) {
          lastError = err;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        throw err;
      }
      return res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error(`${url} failed`);
}

function resolveEndpoint(def: SourceSmokeDefinition): string {
  if (def.id === 'ncaa-scoreboard') return getNcaaLiveEndpoint();
  return def.endpoint;
}

function evaluateSource(
  sport: string,
  parsed: { games: Game[]; rawCount: number; skipped: number },
): ParseBatchReport {
  return evaluateParseBatch(sport, parsed.games, parsed.rawCount, parsed.skipped);
}

function toResult(
  def: SourceSmokeDefinition,
  status: SourceSmokeStatus,
  extra: Partial<SourceSmokeResult> = {},
): SourceSmokeResult {
  return {
    id: def.id,
    kind: def.kind,
    sport: def.sport,
    label: def.label,
    status,
    endpoint: resolveEndpoint(def),
    ...extra,
  };
}

async function smokeSingleSource(
  def: SourceSmokeDefinition,
  fetcher: (endpoint: string) => Promise<unknown>,
): Promise<SourceSmokeResult> {
  const endpoint = resolveEndpoint(def);

  try {
    const raw = await fetcher(endpoint);

    if (def.kind === 'espn') {
      const parsed = parseEspnSource(def.sport as SportType, raw);
      if (!parsed.rawCount) {
        return toResult(def, def.allowEmpty ? 'skipped' : 'ok', {
          reason: def.allowEmpty ? 'no_events' : undefined,
          report: def.allowEmpty ? undefined : evaluateSource(def.sport, parsed),
        });
      }
      if (parsed.scheduledEmpty && def.allowScheduledEmpty) {
        return toResult(def, 'skipped', { reason: 'scheduled_no_field' });
      }
      const report = evaluateSource(def.sport, parsed);
      return toResult(def, 'ok', { report });
    }

    if (def.kind === 'action-network') {
      const league = def.endpoint.split('/').pop()!;
      const parsed = parseActionNetworkSource(league, raw);
      if (!parsed.rawCount && def.allowEmpty) {
        return toResult(def, 'skipped', { reason: 'no_events' });
      }
      const report = evaluateSource(def.sport, parsed);
      return toResult(def, 'ok', { report });
    }

    if (def.kind === 'supplemental') {
      if (def.id === 'wnba-espn') {
        const parsed = parseWnbaEspnSource(raw);
        if (!parsed.rawCount) {
          return toResult(def, 'skipped', { reason: 'no_events' });
        }
        return toResult(def, 'ok', { report: evaluateSource('WNBA', parsed) });
      }
      if (def.id === 'ncaa-scoreboard') {
        const parsed = parseNcaaSource(raw);
        if (!parsed.rawCount) {
          return toResult(def, 'skipped', { reason: 'no_events' });
        }
        return toResult(def, 'ok', { report: evaluateSource('NCAA', parsed) });
      }
    }

    return toResult(def, 'skipped', { reason: 'unsupported_source' });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (def.id === 'ncaa-scoreboard' && reason.includes('404')) {
      return toResult(def, 'skipped', { reason: 'off_season' });
    }
    if (def.allowEmpty && (reason.includes('404') || reason.includes('HTTP 204'))) {
      return toResult(def, 'skipped', { reason: 'no_events' });
    }
    return toResult(def, 'fetch_failed', { reason });
  }
}

async function smokeAggregateSources(): Promise<SourceSmokeResult[]> {
  const results: SourceSmokeResult[] = [];

  for (const agg of AGGREGATE_SMOKE_SOURCES) {
    try {
      if (agg.id === 'supplemental-soccer') {
        const { games, sources } = await fetchSupplementalSoccerScoreboards();
        const rawCount = Math.max(games.length, sources.length);
        const report = evaluateParseBatch('SOCCER', games, rawCount, Math.max(0, rawCount - games.length));
        results.push({
          id: agg.id,
          kind: 'aggregate',
          sport: agg.sport,
          label: agg.label,
          status: games.length || rawCount === 0 ? 'ok' : 'skipped',
          reason: games.length ? undefined : 'no_events',
          endpoint: 'aggregate:supplemental-soccer',
          report: games.length ? report : undefined,
        });
        continue;
      }

      if (agg.id === 'supplemental-fights') {
        const { games, sources } = await fetchSupplementalFightScoreboards();
        const rawCount = Math.max(games.length, sources.length);
        const report = evaluateParseBatch('FIGHTS', games, rawCount, Math.max(0, rawCount - games.length));
        results.push({
          id: agg.id,
          kind: 'aggregate',
          sport: agg.sport,
          label: agg.label,
          status: games.length || rawCount === 0 ? 'ok' : 'skipped',
          reason: games.length ? undefined : 'no_events',
          endpoint: 'aggregate:supplemental-fights',
          report: games.length ? report : undefined,
        });
      }
    } catch (err) {
      results.push({
        id: agg.id,
        kind: 'aggregate',
        sport: agg.sport,
        label: agg.label,
        status: 'fetch_failed',
        reason: err instanceof Error ? err.message : String(err),
        endpoint: `aggregate:${agg.id}`,
      });
    }
  }

  return results;
}

async function smokeMergeSources(
  fetcher: (endpoint: string) => Promise<unknown>,
): Promise<MergeSmokeResult[]> {
  const merges: MergeSmokeResult[] = [];

  for (const def of MERGE_SMOKE_DEFINITIONS) {
    try {
      const [espnRaw, anRaw] = await Promise.all([
        fetcher(def.espnEndpoint),
        fetcher(`/api/action-network/scoreboard/${def.anLeague}`),
      ]);
      merges.push(simulateEspnActionNetworkMerge(
        def.id,
        def.sport as SportType,
        espnRaw,
        anRaw,
        def.anLeague,
      ));
    } catch {
      // Non-fatal — merge skipped when fetch fails
    }
  }

  return merges;
}

export async function runLiveSmoke(options: RunLiveSmokeOptions = {}): Promise<SourceSmokeResult[]> {
  const fetcher = options.fetchJson
    ?? ((endpoint: string) => fetchLiveJson(endpoint, {
      apiBase: options.apiBase,
      timeoutMs: options.timeoutMs,
    }));

  const definitions = [
    ...ESPN_SMOKE_SOURCES,
    ...ACTION_NETWORK_SMOKE_SOURCES,
    ...SUPPLEMENTAL_SMOKE_SOURCES,
  ];

  const results: SourceSmokeResult[] = [];
  for (const def of definitions) {
    results.push(await smokeSingleSource(def, fetcher));
  }

  if (options.includeAggregate !== false) {
    results.push(...await smokeAggregateSources());
  }

  return results;
}

export async function runMergeSmoke(options: RunLiveSmokeOptions = {}): Promise<MergeSmokeResult[]> {
  const fetcher = options.fetchJson
    ?? ((endpoint: string) => fetchLiveJson(endpoint, {
      apiBase: options.apiBase,
      timeoutMs: options.timeoutMs,
    }));

  return smokeMergeSources(fetcher);
}

/** Offline ESPN parse helper for golden fixtures. */
export function smokeParseRawScoreboard(sport: SportType, raw: unknown): SourceSmokeResult {
  const def = ESPN_SMOKE_SOURCES.find((s) => s.sport === sport)!;
  const parsed = parseEspnSource(sport, raw);

  if (!parsed.rawCount) {
    return toResult(def, 'skipped', { reason: 'no_events' });
  }
  if (parsed.scheduledEmpty) {
    return toResult(def, 'skipped', { reason: 'scheduled_no_field' });
  }

  return toResult(def, 'ok', { report: evaluateSource(sport, parsed) });
}

export function buildLiveSmokeReport(
  results: SourceSmokeResult[],
  merges: MergeSmokeResult[] = [],
): string {
  const reports = results
    .map((r) => r.report)
    .filter((r): r is ParseBatchReport => r != null);

  const payload = JSON.parse(buildDriftReport(reports)) as Record<string, unknown>;
  payload.apiBase = liveApiBase();
  payload.sources = results.map((r) => ({
    id: r.id,
    kind: r.kind,
    sport: r.sport,
    label: r.label,
    status: r.status,
    reason: r.reason,
    endpoint: r.endpoint,
    healthy: r.report?.healthy ?? null,
    parseRate: r.report?.metrics.parseRate ?? null,
    raw: r.report?.metrics.rawCount ?? null,
    parsed: r.report?.metrics.parsedCount ?? null,
    errors: r.report?.metrics.errorCount ?? null,
  }));
  payload.merges = merges.map((m) => ({
    id: m.id,
    sport: m.sport,
    healthy: m.healthy,
    espnGames: m.espnGames.length,
    anGames: m.anGames.length,
    merged: m.merged.length,
    mergeIssues: m.mergeIssues.map((i) => i.code),
    parseRate: m.report.metrics.parseRate,
  }));
  payload.activeSources = results.filter((r) => r.status === 'ok').length;
  payload.skippedSources = results.filter((r) => r.status === 'skipped').length;
  payload.failedFetches = results.filter((r) => r.status === 'fetch_failed').length;
  payload.healthyMerges = merges.filter((m) => m.healthy).length;
  payload.totalMerges = merges.length;

  payload.adjusterV2 = {
    dlq: getDlqSnapshot(20).map((e) => ({
      dedupeKey: e.dedupeKey,
      field: e.canonicalField,
      count: e.occurrenceCount,
      lastSeenAt: e.lastSeenAt,
    })),
    governor: getGovernorStats(),
    chrono: {
      games: getChronoRecords().length,
      recentTransitions: getRecentChronoTransitions().slice(-10),
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function liveDriftReportPath(date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return path.resolve(process.cwd(), `../.development/reports/drift-${day}.json`);
}

export async function writeLiveDriftReport(
  results: SourceSmokeResult[],
  merges: MergeSmokeResult[] = [],
  filePath = liveDriftReportPath(),
): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buildLiveSmokeReport(results, merges), 'utf8');
  return filePath;
}

// Back-compat aliases
export { ESPN_SMOKE_SOURCES as LIVE_SMOKE_SOURCES };
export { fetchLiveJson as fetchLiveScoreboard };
export type LiveSmokeSportResult = SourceSmokeResult;
