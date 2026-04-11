import * as jose from 'jose';
import { createHash } from 'crypto';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';

const JWT_ISSUER = 'uaip';
const JWT_AUDIENCE = 'uaip-services';
const SAFE_ENVS_FOR_DEV = new Set(['development', 'test']);

interface JWKSKeyPair {
  privateKey: jose.KeyLike;
  publicKey: jose.KeyLike;
  kid: string;
}

let cachedKeyPair: JWKSKeyPair | null = null;
let initPromise: Promise<JWKSKeyPair> | null = null;

/**
 * Compute a key ID (kid) from the public key's JWK thumbprint,
 * or use the JWT_KEY_ID env var if set.
 */
async function computeKid(publicKey: jose.KeyLike): Promise<string> {
  const envKid = process.env.JWT_KEY_ID;
  if (envKid) {
    return envKid;
  }

  const jwk = await jose.exportJWK(publicKey);
  if (jwk.n) {
    return createHash('sha256').update(jwk.n).digest('hex').slice(0, 16);
  }

  // Fallback: hash the full JWK
  return createHash('sha256').update(JSON.stringify(jwk)).digest('hex').slice(0, 16);
}

/**
 * Initialize the RSA key pair. Thread-safe via promise caching.
 * - If JWT_PRIVATE_KEY env var is set, imports the PEM key.
 * - Otherwise (dev mode), auto-generates an RSA-2048 key pair.
 */
async function initializeKeyPair(): Promise<JWKSKeyPair> {
  if (cachedKeyPair) {
    return cachedKeyPair;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const privatePem = process.env.JWT_PRIVATE_KEY;

    if (privatePem) {
      logger.info('JWKS: Loading RSA private key from JWT_PRIVATE_KEY env var');
      const privateKey = await jose.importPKCS8(privatePem, 'RS256');

      // Derive public key by exporting to JWK and re-importing public components
      const privateJwk = await jose.exportJWK(privateKey);
      const publicJwk: jose.JWK = {
        kty: privateJwk.kty,
        n: privateJwk.n,
        e: privateJwk.e,
      };
      const publicKey = await jose.importJWK(publicJwk, 'RS256');

      if (typeof publicKey === 'string' || publicKey instanceof Uint8Array) {
        throw new Error('JWKS: Failed to derive public key from private key');
      }

      const kid = await computeKid(publicKey);
      cachedKeyPair = { privateKey, publicKey, kid };
      logger.info('JWKS: RSA key pair loaded from environment', { kid });
      return cachedKeyPair;
    }

    // Dev mode: auto-generate
    const nodeEnv = process.env.NODE_ENV ?? '';
    const isDevOrTest = SAFE_ENVS_FOR_DEV.has(nodeEnv);

    if (!isDevOrTest) {
      logger.warn(
        'JWKS: No JWT_PRIVATE_KEY set in non-dev environment. Auto-generating ephemeral key pair. ' +
          'Set JWT_PRIVATE_KEY for production use.'
      );
    } else {
      logger.info('JWKS: Auto-generating RSA-2048 key pair for development');
    }

    const { privateKey, publicKey } = await jose.generateKeyPair('RS256', {
      modulusLength: 2048,
    });

    const kid = await computeKid(publicKey);
    cachedKeyPair = { privateKey, publicKey, kid };
    logger.info('JWKS: RSA key pair generated', { kid });
    return cachedKeyPair;
  })();

  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

/**
 * Get the RSA private key for signing JWTs.
 */
export async function getPrivateKey(): Promise<jose.KeyLike> {
  const kp = await initializeKeyPair();
  return kp.privateKey;
}

/**
 * Get the public JWKS (JSON Web Key Set) in RFC 7517 format.
 * Suitable for serving at /.well-known/jwks.json
 */
export async function getPublicJWKS(): Promise<{ keys: jose.JWK[] }> {
  const kp = await initializeKeyPair();
  const jwk = await jose.exportJWK(kp.publicKey);

  return {
    keys: [
      {
        ...jwk,
        kid: kp.kid,
        alg: 'RS256',
        use: 'sig',
      },
    ],
  };
}

/**
 * Sign a JWT payload using RS256 with the JWKS private key.
 */
export async function signJWT(payload: Record<string, unknown>): Promise<string> {
  const kp = await initializeKeyPair();

  const token = await new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: 'RS256', kid: kp.kid })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(process.env.JWT_RS256_EXPIRY || '15m')
    .sign(kp.privateKey);

  return token;
}

/**
 * Verify a JWT token using the JWKS public key (RS256).
 * Returns the decoded payload.
 */
export async function verifyJWT(token: string): Promise<jose.JWTPayload> {
  const kp = await initializeKeyPair();

  try {
    const { payload } = await jose.jwtVerify(token, kp.publicKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return payload;
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      throw new ApiError(401, 'Token expired', 'TOKEN_EXPIRED');
    }
    if (error instanceof jose.errors.JWTClaimValidationFailed) {
      throw new ApiError(401, 'Invalid token claims', 'INVALID_TOKEN');
    }
    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      throw new ApiError(401, 'Invalid token signature', 'INVALID_TOKEN');
    }
    throw new ApiError(401, 'Invalid token', 'INVALID_TOKEN');
  }
}

/**
 * Get the key ID (kid) of the current signing key.
 */
export async function getKeyId(): Promise<string> {
  const kp = await initializeKeyPair();
  return kp.kid;
}

/**
 * Reset the cached key pair. Useful for testing.
 */
export function resetKeyPair(): void {
  cachedKeyPair = null;
  initPromise = null;
}
