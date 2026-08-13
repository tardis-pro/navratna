import { beforeAll, describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = 'socket-io-algorithm-test-secret-32-bytes'
  process.env.JWT_REFRESH_SECRET = 'socket-io-refresh-test-secret-32-bytes'
  process.env.DELETION_HASH_SALT = 'socket-io-deletion-salt-32-bytes'
})

describe('JWTValidator.verifyAny', () => {
  it('accepts an RS256 access token', async () => {
    // Given
    const { JWTValidator } = await import('../j_w_t_validator.js')
    const token = await JWTValidator.signRS256({
      userId: '1c0f06bb-c1be-4b89-bca4-0e73ff7e3845',
      email: 'socket@example.com',
      role: 'user',
    })

    // When
    const claims = await JWTValidator.verifyAny(token)

    // Then
    expect(claims.userId).toBe('1c0f06bb-c1be-4b89-bca4-0e73ff7e3845')
  })

  it('accepts an HS256 access token', async () => {
    // Given
    const { JWTValidator } = await import('../j_w_t_validator.js')
    const token = JWTValidator.sign({
      userId: '1c0f06bb-c1be-4b89-bca4-0e73ff7e3845',
      email: 'socket@example.com',
      role: 'user',
    })

    // When
    const claims = await JWTValidator.verifyAny(token)

    // Then
    expect(claims.userId).toBe('1c0f06bb-c1be-4b89-bca4-0e73ff7e3845')
  })

  it('rejects access tokens that declare an unsupported algorithm', async () => {
    const { JWTValidator } = await import('../j_w_t_validator.js')
    const token = jwt.sign(
      {
        userId: '1c0f06bb-c1be-4b89-bca4-0e73ff7e3845',
        email: 'socket@example.com',
        role: 'user',
        iss: 'uaip',
        aud: 'uaip-services',
      },
      process.env.JWT_SECRET!,
      { algorithm: 'HS384' }
    )

    await expect(JWTValidator.verifyAny(token)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_TOKEN',
    })
  })
})
