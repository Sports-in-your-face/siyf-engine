import { describe, expect, it } from 'vitest';
import {
  coerceDisplayString,
  isWnbaGame,
  parseDisplayScore,
  scoreIsEmpty,
  scoreToNumber,
  shouldUseNbaTeamCdn,
} from '../coerce';

describe('coerceDisplayString', () => {
  it('unwraps ESPN displayValue objects', () => {
    expect(coerceDisplayString({ displayValue: '105' })).toBe('105');
    expect(coerceDisplayString({ displayName: 'Chicago Sky' })).toBe('Chicago Sky');
  });

  it('returns fallback for nullish values', () => {
    expect(coerceDisplayString(null, '—')).toBe('—');
    expect(coerceDisplayString(undefined, 'TBD')).toBe('TBD');
  });
});

describe('parseDisplayScore', () => {
  it('normalizes object scores from ESPN', () => {
    expect(parseDisplayScore({ displayValue: '98' })).toBe(98);
    expect(parseDisplayScore({ value: '12' })).toBe(12);
  });

  it('passes through numbers and strings', () => {
    expect(parseDisplayScore(42)).toBe(42);
    expect(parseDisplayScore('OT')).toBe('OT');
    expect(parseDisplayScore(null)).toBeNull();
  });
});

describe('league helpers', () => {
  it('detects WNBA games', () => {
    expect(isWnbaGame({ sport: 'WNBA' })).toBe(true);
    expect(isWnbaGame({ sport: 'NBA' })).toBe(false);
  });

  it('limits NBA CDN to core basketball', () => {
    expect(shouldUseNbaTeamCdn({ sport: 'NBA' })).toBe(true);
    expect(shouldUseNbaTeamCdn({ sport: 'WNBA' })).toBe(false);
    expect(shouldUseNbaTeamCdn({ sport: 'NCAA' })).toBe(false);
  });
});

describe('scoreToNumber / scoreIsEmpty', () => {
  it('unwraps object scores for comparisons', () => {
    expect(scoreToNumber({ displayValue: '105' })).toBe(105);
    expect(scoreIsEmpty({ displayValue: '0' })).toBe(false);
    expect(scoreIsEmpty({ displayValue: '' })).toBe(true);
    expect(scoreIsEmpty(null)).toBe(true);
  });
});
