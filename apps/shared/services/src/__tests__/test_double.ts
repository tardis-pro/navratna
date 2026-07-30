/**
 * Typed partial test double. Unlike `as unknown as T`, the argument is checked
 * against T, so a renamed or mistyped member fails the build instead of
 * silently producing a mock the subject never calls.
 */
export function testDouble<T>(partial: Partial<T>): T {
  return partial as T;
}
