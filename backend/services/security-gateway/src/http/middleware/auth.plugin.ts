import { validateJWTToken } from '@uaip/middleware';

// Attaches ctx.user if a valid Bearer token is present
export function attachAuth(app: any): any {
  return (app as any).derive(async ({ headers }: any) => {
    const auth = headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return { user: null };
    const token = auth.substring(7);
    const result = await validateJWTToken(token);
    if (!result.valid) return { user: null };
    return {
      user: {
        id: result.userId!,
        email: result.email!,
        role: result.role!,
        sessionId: result.sessionId,
      },
    };
  });
}

// Enforces authentication for the current group/routes
export function requireAuth(app: any): any {
  return (app as any).guard({
    beforeHandle({ user, set }: any) {
      if (!user) {
        set.status = 401;
        return { error: 'Authentication required' };
      }
    },
  });
}

// Enforces admin role
export function requireAdmin(app: any): any {
  return (app as any).guard({
    beforeHandle({ user, set }: any) {
      if (!user) {
        set.status = 401;
        return { error: 'Authentication required' };
      }
      if (user.role !== 'admin') {
        set.status = 403;
        return { error: 'Admin access required' };
      }
    },
  });
}

// Enforces operator-level access (operator or admin or security_admin)
export function requireOperator(app: any): any {
  return (app as any).guard({
    beforeHandle({ user, set }: any) {
      if (!user) {
        set.status = 401;
        return { error: 'Authentication required' };
      }
      const role = (user.role || '').toLowerCase();
      const ok =
        role === 'admin' ||
        role === 'operator' ||
        role === 'security_admin' ||
        role === 'security-admin';
      if (!ok) {
        set.status = 403;
        return { error: 'Operator access required' };
      }
    },
  });
}

// Helper combinators
export const withOptionalAuth = attachAuth;
export const withRequiredAuth = (app: any) => requireAuth(attachAuth(app));
export const withAdminGuard = (app: any) => requireAdmin(attachAuth(app));
export const withOperatorGuard = (app: any) => requireOperator(attachAuth(app));
