/**
 * Elysia seeds `set.status` with 200 before a handler runs, so an unmatched route
 * arrives at onError still carrying a success status. Only a status that is
 * itself an error is trustworthy; anything below 400 means no handler classified
 * the failure, so the error code decides instead.
 */
export function resolveErrorStatus(code: string | number, carriedStatus: unknown): number {
  if (typeof carriedStatus === 'number' && carriedStatus >= 400) {
    return carriedStatus;
  }
  return code === 'NOT_FOUND' ? 404 : 500;
}
