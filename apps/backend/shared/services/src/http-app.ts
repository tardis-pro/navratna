import { Elysia } from 'elysia';

// Centralized Elysia app factory. Only this module touches Elysia.

export type AppServer = Elysia;

export function createAppServer(): AppServer {
  return new Elysia();
}

export default function elysiaApp(): AppServer {
  return createAppServer();
}
