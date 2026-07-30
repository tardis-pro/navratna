// @uaip/config resolves these at module scope via throw-expressions, so they must
// exist before any import of the config graph or the suite fails to load.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.DELETION_HASH_SALT = 'test-deletion-hash-salt';
