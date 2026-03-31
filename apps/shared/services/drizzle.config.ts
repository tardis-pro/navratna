/**
 * Drizzle Kit CLI Configuration — Navratna v3.0
 *
 * Used for: drizzle-kit studio, drizzle-kit generate (future migrations)
 * NOTE: Do NOT run drizzle-kit push unless schema migrations have been applied.
 * Use this config to introspect existing schema or generate migration files
 * once the Drizzle migration is fully validated.
 */

import type { Config } from 'drizzle-kit';

// Parse connection string from env
function getDbUrl(): string {
    if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;

    const host = process.env.POSTGRES_HOST || 'localhost';
    const port = process.env.POSTGRES_PORT || '5432';
    const user = process.env.POSTGRES_USER || 'uaip_user';
    const password = process.env.POSTGRES_PASSWORD || 'uaip_password';
    const db = process.env.POSTGRES_DB || 'uaip';

    return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

export default {
    schema: ['./src/database/drizzle/schemas/intelligence.schema.ts', './src/database/drizzle/schemas/control.schema.ts'],
    out: './src/database/drizzle/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: getDbUrl(),
    },
    // Verbose output for debugging
    verbose: true,
    // Strict mode — fails if schema has breaking changes vs DB
    strict: false,
} satisfies Config;
