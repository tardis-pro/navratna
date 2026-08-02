import { describe, expect, it } from 'vitest';
import { userInitials } from './user_initials';

describe('userInitials', () => {
  it('uses both name initials when the user has a full name', () => {
    expect(userInitials({ firstName: 'Pronit', lastName: 'Das' })).toBe('PD');
  });

  it('falls back to the email when no name is stored', () => {
    expect(userInitials({ email: 'pronit@example.com' })).toBe('P');
  });

  /**
   * The avatar is the only logout affordance in the shell, so an empty trigger
   * would leave the user with no way to sign out.
   */
  it('never renders an empty trigger for a nameless, email-less user', () => {
    expect(userInitials({})).toBe('?');
    expect(userInitials(null)).toBe('?');
    expect(userInitials({ firstName: '   ', email: '  ' })).toBe('?');
  });
});
