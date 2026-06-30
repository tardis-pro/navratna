import { describe, it, expect } from 'vitest';
import { gatewayApp } from '../../app.js';

describe('NavratnaGateway Route Registration', () => {
  it('should have health endpoint returning 200', async () => {
    const response = await gatewayApp.handle(new Request('http://localhost/health'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('navratna-gateway');
  });

  it('should reject unauthenticated requests to protected routes with 401 or 403 or 404', async () => {
    const protectedRoutes = [
      '/api/v1/auth/logout',
      '/api/v1/agents',
    ];

    for (const route of protectedRoutes) {
      const response = await gatewayApp.handle(new Request(`http://localhost${route}`));
      expect([401, 403, 404]).toContain(response.status);
    }
  });

  it('should return 404 for unknown routes', async () => {
    const response = await gatewayApp.handle(
      new Request('http://localhost/api/v1/nonexistent-endpoint-xyz')
    );
    expect(response.status).toBe(404);
  });

  it('should handle POST to auth login without crashing', async () => {
    const response = await gatewayApp.handle(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect([200, 400, 401, 422]).toContain(response.status);
  });

  it('should export NavratnaGatewayApp type', () => {
    expect(gatewayApp).toBeDefined();
    expect(typeof gatewayApp.handle).toBe('function');
  });
});
