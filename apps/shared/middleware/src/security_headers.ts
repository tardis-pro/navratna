import { Elysia } from 'elysia';

export const securityHeadersPlugin = new Elysia({ name: 'security-headers' }).onAfterHandle(
  ({ set }) => {
    set.headers['X-Content-Type-Options'] = set.headers['X-Content-Type-Options'] ?? 'nosniff';
    set.headers['X-Frame-Options'] = set.headers['X-Frame-Options'] ?? 'SAMEORIGIN';
    set.headers['X-XSS-Protection'] = set.headers['X-XSS-Protection'] ?? '1; mode=block';
    set.headers['Referrer-Policy'] =
      set.headers['Referrer-Policy'] ?? 'strict-origin-when-cross-origin';
    set.headers['Permissions-Policy'] =
      set.headers['Permissions-Policy'] ?? 'camera=(), microphone=(), geolocation=(), payment=()';
  }
);
