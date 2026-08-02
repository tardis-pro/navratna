interface InitialsSource {
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * Falls back through name → email → '?' because the avatar is the only logout
 * affordance in the shell: an empty trigger would leave the user with no way to
 * sign out.
 */
export function userInitials(user: InitialsSource | null | undefined): string {
  if (!user) return '?';

  const fromName = `${user.firstName?.trim().charAt(0) ?? ''}${user.lastName?.trim().charAt(0) ?? ''}`;
  if (fromName) return fromName.toUpperCase();

  const emailInitial = user.email?.trim().charAt(0);
  return emailInitial ? emailInitial.toUpperCase() : '?';
}
