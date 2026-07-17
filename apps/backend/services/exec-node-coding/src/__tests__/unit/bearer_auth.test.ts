import { describe, it, expect } from 'vitest';
import { extractBearerToken } from '../../auth/jwt_auth.js';

describe('extractBearerToken', () => {
  it('returns undefined for missing header', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it('returns undefined for malformed header (no space)', () => {
    expect(extractBearerToken('Bearer')).toBeUndefined();
  });

  it('returns undefined for wrong scheme', () => {
    expect(extractBearerToken('Basic abc123')).toBeUndefined();
  });

  it('extracts token from valid header (case-insensitive scheme)', () => {
    expect(extractBearerToken('Bearer mytoken')).toBe('mytoken');
    expect(extractBearerToken('bearer mytoken')).toBe('mytoken');
    expect(extractBearerToken('BEARER mytoken')).toBe('mytoken');
  });

  it('returns undefined when header has more than 2 parts', () => {
    expect(extractBearerToken('Bearer my token extra')).toBeUndefined();
  });
});
