import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GOLDEN_FIXTURES } from '../fixtureManifest';
import { loadGoldenFixture, parseGoldenFixture } from '../fixtureTestUtils';

const baselinePath = path.resolve(import.meta.dirname, '../__benchmarks__/baseline.json');

describe('drift:capture', () => {
  it('writes observed parse rates to baseline.json', async () => {
    const bySport = new Map<string, { raw: number; parsed: number }>();

    for (const entry of GOLDEN_FIXTURES) {
      const raw = loadGoldenFixture(entry.file);
      const parsed = parseGoldenFixture(entry.parser, entry.sport, raw);
      const bucket = bySport.get(entry.sport) ?? { raw: 0, parsed: 0 };
      bucket.raw += 1;
      bucket.parsed += parsed.length;
      bySport.set(entry.sport, bucket);
    }

    const existing = JSON.parse(await fs.readFile(baselinePath, 'utf8')) as {
      version: number;
      capturedAt: string | null;
      note: string;
      sports: Record<string, { targetParseRate: number; observedParseRate: number | null; sampleRawCount: number | null }>;
    };

    for (const [sport, counts] of bySport) {
      const rate = counts.raw > 0 ? counts.parsed / counts.raw : 1;
      if (!existing.sports[sport]) {
        existing.sports[sport] = { targetParseRate: rate, observedParseRate: rate, sampleRawCount: counts.raw };
      } else {
        existing.sports[sport].observedParseRate = rate;
        existing.sports[sport].sampleRawCount = counts.raw;
      }
    }

    existing.capturedAt = new Date().toISOString();
    await fs.writeFile(baselinePath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');

    expect(existing.capturedAt).toBeTruthy();
    for (const [, s] of Object.entries(existing.sports)) {
      if (s.sampleRawCount != null && s.sampleRawCount > 0) {
        expect(s.observedParseRate).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
