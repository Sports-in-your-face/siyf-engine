import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as siyfCdn from '../../../config/siyfCdn';
import {
  BUNDLED_ADJUSTER_SCHEMA_VERSION,
  checkAdjusterSchemaVersion,
  loadAdjusterSchemaFromCdn,
  resetAdjusterSchemaStatus,
} from '../schemaVersion';

describe('adjuster schema version pin', () => {
  beforeEach(() => {
    resetAdjusterSchemaStatus();
    vi.restoreAllMocks();
  });

  it('accepts matching CDN schema version', async () => {
    vi.spyOn(siyfCdn, 'fetchCdnAdjusterSchema').mockResolvedValue({
      version: BUNDLED_ADJUSTER_SCHEMA_VERSION,
      governor: { hourBudget: 3600, ageOutMs: 240_000 },
    });
    const ok = await checkAdjusterSchemaVersion();
    expect(ok).toBe(true);
    const status = await loadAdjusterSchemaFromCdn();
    expect(status.matched).toBe(true);
    expect(status.governorAligned).toBe(true);
  });

  it('flags mismatch but keeps bundled registry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(siyfCdn, 'fetchCdnAdjusterSchema').mockResolvedValue({
      version: BUNDLED_ADJUSTER_SCHEMA_VERSION + 1,
      governor: { hourBudget: 3600, ageOutMs: 240_000 },
    });
    const ok = await checkAdjusterSchemaVersion();
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
