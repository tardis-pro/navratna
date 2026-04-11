# @tardis/auth

Lightweight auth middleware for TARDIS platform subdomains. Validates JWT tokens issued by `tardis.digital` using JWKS (JSON Web Key Set) public key verification.

## Install

```bash
npm install @tardis/auth
# or
pnpm add @tardis/auth
```

## How it works

1. TARDIS publishes a JWKS at `https://tardis.digital/.well-known/jwks.json`
2. This package fetches the public keys and caches them (default: 1 hour TTL)
3. Incoming JWTs are verified locally against the cached public key
4. No shared secrets, no round-trip to the auth server per request

## Usage

### Elysia (Bun)

```ts
import { Elysia } from "elysia";
import { tardisAuth } from "@tardis/auth/elysia";

const app = new Elysia()
  .use(tardisAuth())
  .get("/me", ({ user }) => user)
  .listen(3000);
```

### Express / Connect

```ts
import express from "express";
import { tardisAuth } from "@tardis/auth/express";

const app = express();
app.use(tardisAuth());
app.get("/me", (req, res) => res.json(req.user));
app.listen(3000);
```

### Hono (Cloudflare Workers / Bun / Deno)

```ts
import { Hono } from "hono";
import { tardisAuth } from "@tardis/auth/hono";

const app = new Hono();
app.use("*", tardisAuth());
app.get("/me", (c) => c.json(c.get("user")));
export default app;
```

### Core (framework-agnostic)

```ts
import { TardisAuth } from "@tardis/auth";

const auth = new TardisAuth();
const user = await auth.verifyToken(rawJWT);
```

## Configuration

All middleware functions accept an optional config object:

```ts
tardisAuth({
  jwksUrl: "https://tardis.digital/.well-known/jwks.json", // default
  issuer: "uaip",           // expected JWT issuer claim
  audience: "uaip-services", // expected JWT audience claim
  cacheTTL: 3_600_000,      // JWKS cache duration in ms (default: 1 hour)
});
```

## Token extraction

Tokens are extracted in this order:

1. `Authorization: Bearer <token>` header
2. `access_token` cookie (httpOnly cookie set by tardis.digital)

## User payload

On successful verification, the middleware provides a `TardisUser` object:

```ts
interface TardisUser {
  userId: string;    // JWT `sub` claim
  email: string;     // JWT `email` claim
  role: string;      // JWT `role` claim (defaults to "user")
  sessionId?: string; // JWT `sessionId` claim (optional)
}
```

## License

Private - TARDIS Platform
