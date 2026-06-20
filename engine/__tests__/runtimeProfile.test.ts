import { describe, expect, it, beforeEach } from 'vitest';
import { getSportCapabilities } from '../core/sportCapabilities';
import { getEngineRuntimeMode, setEngineRuntimeMode } from '../runtimeProfile';

describe('runtimeProfile', () => {
  beforeEach(() => {
    setEngineRuntimeMode('default');
  });

  it('trims extension-only pipelines for chrome', () => {
    setEngineRuntimeMode('extension');
    for (const sport of ['BASEBALL', 'HOCKEY', 'FOOTBALL', 'BASKETBALL', 'GOLF', 'TENNIS', 'FIGHTS'] as const) {
      const caps = getSportCapabilities(sport);
      expect(caps.pipeline.rss).toBe(false);
      expect(caps.pipeline.enrichMissingContext).toBe(false);
      expect(caps.features.standings).toBe(false);
    }
    expect(getEngineRuntimeMode()).toBe('extension');
  });

  it('keeps full website capabilities by default', () => {
    const caps = getSportCapabilities('BASEBALL');
    expect(caps.pipeline.rss).toBe(true);
    expect(caps.features.standings).toBe(true);
  });
});
