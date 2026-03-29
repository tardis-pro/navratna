import { z } from 'zod';

export function validateWithZod<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { error: { details: { message: string; path: string }[] } | null; value: T | null } {
  const result = schema.safeParse(data);
  if (result.success) return { error: null, value: result.data };
  return {
    error: {
      details: result.error.errors.map((e) => ({ message: e.message, path: e.path.join('.') })),
    },
    value: null,
  };
}

export function requireAuth(
  user: { id: string } | undefined,
  set: { status?: number | string }
): { error: string } | null {
  if (!user) {
    set.status = 401;
    return { error: 'Authentication required' };
  }
  return null;
}
