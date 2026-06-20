import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  engineLogWarn,
  getShowEngineErrors,
  resetShowEngineErrorsOverride,
  setShowEngineErrors,
} from '../engineLog';

describe('engineLog', () => {
  beforeEach(() => {
    resetShowEngineErrorsOverride();
  });

  afterEach(() => {
    resetShowEngineErrorsOverride();
    vi.restoreAllMocks();
  });

  it('suppresses console output when show-errors is false', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setShowEngineErrors(false);
    engineLogWarn('[test] muted');
    expect(spy).not.toHaveBeenCalled();
  });

  it('allows console output when show-errors is true', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setShowEngineErrors(true);
    engineLogWarn('[test] visible');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('defaults to enabled outside production builds', () => {
    expect(getShowEngineErrors()).toBe(true);
  });
});
