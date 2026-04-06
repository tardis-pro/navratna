import { describe, it, expect } from 'vitest';
import { coreApp } from '../../app';

describe('NavratnaCore App', () => {
  it('should create the Elysia app instance', () => {
    expect(coreApp).toBeDefined();
  });

  it('should respond to health check', async () => {
    const response = await coreApp.handle(
      new Request('http://localhost/health')
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('navratna-core');
  });

  it('should respond to detailed health check', async () => {
    const response = await coreApp.handle(
      new Request('http://localhost/health/detailed')
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('navratna-core');
  });

  it('should export the app type', () => {
    type AppType = typeof coreApp;
    const _typeCheck: AppType = coreApp;
    expect(_typeCheck).toBeDefined();
  });
});
