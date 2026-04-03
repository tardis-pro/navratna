import { describe, it, expect } from 'vitest';
import { gatewayApp } from '../../app';

describe('NavratnaGateway App', () => {
  it('should create the Elysia app instance', () => {
    expect(gatewayApp).toBeDefined();
  });

  it('should respond to health check', async () => {
    const response = await gatewayApp.handle(
      new Request('http://localhost/health')
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('navratna-gateway');
  });

  it('should export the app type', () => {
    type AppType = typeof gatewayApp;
    const _typeCheck: AppType = gatewayApp;
    expect(_typeCheck).toBeDefined();
  });
});
