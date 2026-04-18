import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

type GettableHeaders = { get(name: string): string | null };
type RecordHeaders = Record<string, string | string[] | undefined>;
type HeadersLike = GettableHeaders | RecordHeaders;

/**
 * Shape consumed by {@link TardisAuth.extractToken}. Both Node.js
 * `IncomingMessage` (record-style headers) and Fetch `Request` (Headers
 * instance) satisfy this structurally, so callers across Elysia/Hono/Express
 * can pass their native request object without casts.
 */
export interface ExtractTokenRequest {
  headers: HeadersLike;
}

function readHeader(headers: HeadersLike, name: string): string | null {
  if (typeof (headers as GettableHeaders).get === "function") {
    const value = (headers as GettableHeaders).get(name);
    return typeof value === "string" ? value : null;
  }
  const bag = headers as RecordHeaders;
  const raw = bag[name] ?? bag[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === "string" ? raw : null;
}

/**
 * Authenticated user payload extracted from a TARDIS JWT.
 */
export interface TardisUser {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
}

/**
 * Configuration options for TardisAuth.
 */
export interface TardisAuthOptions {
  /** URL of the JWKS endpoint. Defaults to https://tardis.digital/.well-known/jwks.json */
  jwksUrl?: string;
  /** Expected `iss` claim. Defaults to "uaip" */
  issuer?: string;
  /** Expected `aud` claim. Defaults to "uaip-services" */
  audience?: string;
  /** JWKS cache TTL in milliseconds. Defaults to 3600000 (1 hour) */
  cacheTTL?: number;
}

/**
 * Core JWKS-based JWT validator for the TARDIS platform.
 *
 * Fetches the public key set from tardis.digital and verifies tokens locally.
 * The JWKS is cached and refreshed based on the configured TTL.
 */
export class TardisAuth {
  private readonly jwksUrl: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly cacheTTL: number;
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private jwksCreatedAt: number;

  constructor(options: TardisAuthOptions = {}) {
    this.jwksUrl =
      options.jwksUrl ?? "https://tardis.digital/.well-known/jwks.json";
    this.issuer = options.issuer ?? "uaip";
    this.audience = options.audience ?? "uaip-services";
    this.cacheTTL = options.cacheTTL ?? 3_600_000; // 1 hour
    this.jwks = createRemoteJWKSet(new URL(this.jwksUrl));
    this.jwksCreatedAt = Date.now();
  }

  /**
   * Refresh the cached JWKS if the TTL has elapsed.
   */
  private refreshJWKSIfNeeded(): void {
    if (Date.now() - this.jwksCreatedAt > this.cacheTTL) {
      this.jwks = createRemoteJWKSet(new URL(this.jwksUrl));
      this.jwksCreatedAt = Date.now();
    }
  }

  /**
   * Verify a JWT string and return the authenticated user.
   *
   * @throws If the token is invalid, expired, or claims do not match.
   */
  async verifyToken(token: string): Promise<TardisUser> {
    this.refreshJWKSIfNeeded();

    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.audience,
    });

    return this.payloadToUser(payload);
  }

  /**
   * Extract a bearer token from an incoming request.
   *
   * Checks (in order):
   * 1. `Authorization: Bearer <token>` header
   * 2. `access_token` cookie
   *
   * @returns The raw JWT string, or null if not found.
   */
  extractToken(request: ExtractTokenRequest): string | null {
    const authHeader = readHeader(request.headers, "authorization");
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }

    const cookieHeader = readHeader(request.headers, "cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
      if (match) {
        return match[1] ?? null;
      }
    }

    return null;
  }

  private payloadToUser(payload: JWTPayload): TardisUser {
    const userId = (payload.sub ?? payload.userId ?? "") as string;
    const email = (payload.email ?? "") as string;
    const role = (payload.role ?? "user") as string;
    const sessionId = payload.sessionId as string | undefined;

    if (!userId) {
      throw new Error("JWT missing subject (sub) claim");
    }

    return { userId, email, role, sessionId };
  }
}

/**
 * Create a TardisAuth instance with the given options.
 * Convenience factory for consumers who prefer functional style.
 */
export function createTardisAuth(
  options?: TardisAuthOptions,
): TardisAuth {
  return new TardisAuth(options);
}
