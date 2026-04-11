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
let previousKeyPair: JWKSKeyPair | null = null;
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
  const currentJwk = await jose.exportJWK(kp.publicKey);

  const keys: jose.JWK[] = [
    {
      ...currentJwk,
      kid: kp.kid,
      alg: 'RS256',
      use: 'sig',
    },
  ];

  // Include the previous key for verification during rotation window
  if (previousKeyPair) {
    const prevJwk = await jose.exportJWK(previousKeyPair.publicKey);
    keys.push({
      ...prevJwk,
      kid: previousKeyPair.kid,
      alg: 'RS256',
      use: 'sig',
    });
  }

  return { keys };
}

export interface SignJWTOptions {
  /** Override the audience claim (default: 'uaip-services') */
  audience?: string;
  /** Override the issuer claim (default: 'uaip') */
  issuer?: string;
  /** Override the expiration time (default: JWT_RS256_EXPIRY env or '15m') */
  expiresIn?: string;
}

/**
 * Sign a JWT payload using RS256 with the JWKS private key.
 */
export async function signJWT(
  payload: Record<string, unknown>,
  options?: SignJWTOptions,
): Promise<string> {
  const kp = await initializeKeyPair();

  const token = await new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: 'RS256', kid: kp.kid })
    .setIssuedAt()
    .setIssuer(options?.issuer ?? JWT_ISSUER)
    .setAudience(options?.audience ?? JWT_AUDIENCE)
    .setExpirationTime(options?.expiresIn ?? process.env.JWT_RS256_EXPIRY ?? '15m')
    .sign(kp.privateKey);

  return token;
}

/**
 * Verify a JWT token using the JWKS public key (RS256).
 * Returns the decoded payload.
 */
export async function verifyJWT(token: string, options?: { audience?: string }): Promise<jose.JWTPayload> {
  const kp = await initializeKeyPair();
  const verifyOptions = {
    issuer: JWT_ISSUER,
    audience: options?.audience ?? JWT_AUDIENCE,
  };

  // Try current key first
  try {
    const { payload } = await jose.jwtVerify(token, kp.publicKey, verifyOptions);
    return payload;
  } catch (currentKeyError) {
    // If signature verification failed and we have a previous key, try that
    if (
      previousKeyPair &&
      currentKeyError instanceof jose.errors.JWSSignatureVerificationFailed
    ) {
      try {
        const { payload } = await jose.jwtVerify(token, previousKeyPair.publicKey, verifyOptions);
        return payload;
      } catch (prevKeyError) {
        // Fall through to throw based on the previous key error
        if (prevKeyError instanceof jose.errors.JWTExpired) {
          throw new ApiError(401, 'Token expired', 'TOKEN_EXPIRED');
        }
        if (prevKeyError instanceof jose.errors.JWTClaimValidationFailed) {
          throw new ApiError(401, 'Invalid token claims', 'INVALID_TOKEN');
        }
        // Previous key also failed — token is invalid
        throw new ApiError(401, 'Invalid token signature', 'INVALID_TOKEN');
      }
    }

    // No previous key or non-signature error — map to appropriate ApiError
    if (currentKeyError instanceof jose.errors.JWTExpired) {
      throw new ApiError(401, 'Token expired', 'TOKEN_EXPIRED');
    }
    if (currentKeyError instanceof jose.errors.JWTClaimValidationFailed) {
      throw new ApiError(401, 'Invalid token claims', 'INVALID_TOKEN');
    }
    if (currentKeyError instanceof jose.errors.JWSSignatureVerificationFailed) {
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
 * Rotate the signing key pair.
 * Moves the current key pair to `previousKeyPair` (kept for verification)
 * and generates a fresh RSA-2048 key pair for signing.
 * The JWKS endpoint will expose both keys until the next rotation.
 */
export async function rotateKeyPair(): Promise<void> {
  // Ensure current key pair is initialized
  const current = await initializeKeyPair();

  // Generate new key pair
  const { privateKey, publicKey } = await jose.generateKeyPair('RS256', {
    modulusLength: 2048,
  });
  const kid = await computeKid(publicKey);

  // Demote current to previous, install new as current
  previousKeyPair = current;
  cachedKeyPair = { privateKey, publicKey, kid };
  initPromise = null;

  logger.info('JWKS: Key pair rotated', {
    newKid: kid,
    previousKid: previousKeyPair.kid,
  });
}

/**
 * Reset the cached key pair. Useful for testing.
 */
export function resetKeyPair(): void {
  cachedKeyPair = null;
  previousKeyPair = null;
  initPromise = null;
}
