import { describe, expect, it, beforeEach } from 'vitest';
import {
  canUsePaidApi,
  PAID_API_DAILY_LIMIT,
  PAID_API_LIMITS,
  recordPaidApiGatePass,
  resetPaidKillSwitch,
} from '../paidKillSwitch';
import { resetPaidApiDailyCounts } from '../../core/paidApiDaily';
import { resetPaidApiSessionCounts, trackPaidApiUse } from '../../core/paidApiTelemetry';

describe('paidKillSwitch', () => {
  beforeEach(() => {
    resetPaidKillSwitch();
    resetPaidApiSessionCounts();
    resetPaidApiDailyCounts();
  });

  it('allows calls under session and daily limits', () => {
    const gate = canUsePaidApi('bdl');
    expect(gate.allowed).toBe(true);
    expect(gate.dailyLimit).toBe(PAID_API_DAILY_LIMIT);
  });

  it('blocks when session limit exceeded', () => {
    for (let i = 0; i < PAID_API_LIMITS.bdl.perSession; i++) {
      trackPaidApiUse('bdl');
      recordPaidApiGatePass('bdl');
    }
    const gate = canUsePaidApi('bdl');
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('session limit');
  });
});
