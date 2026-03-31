import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import { capabilities } from '../drizzle/schemas/control.schema';
import type { CapabilitySearchParams } from '../../capability_discovery_service';
import { logger } from '@uaip/utils';

type CapabilityRow = typeof capabilities.$inferSelect;
type NewCapability = typeof capabilities.$inferInsert;

export class CapabilityRepository {
    private get db() {
        return getControlDb();
    }

    async findById(id: string): Promise<CapabilityRow | null> {
        try {
            const [row] = await this.db.select().from(capabilities).where(eq(capabilities.id, id)).limit(1);
            return row ?? null;
        } catch (error: unknown) {
            logger.error('CapabilityRepository.findById failed', {
                id,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async create(data: NewCapability): Promise<CapabilityRow> {
        try {
            const [row] = await this.db.insert(capabilities).values(data).returning();
            return row;
        } catch (error: unknown) {
            logger.error('CapabilityRepository.create failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async searchCapabilities(filters: {
        query?: string;
        type?: string;
        securityLevel?: string;
        limit?: number;
    }): Promise<CapabilityRow[]> {
        try {
            const clauses: SQL<unknown>[] = [];

            if (filters.type) {
                clauses.push(eq(capabilities.type, filters.type));
            }

            if (filters.query) {
                const pattern = `%${filters.query}%`;
                clauses.push(or(ilike(capabilities.name, pattern), ilike(capabilities.description, pattern))!);
            }

            const whereClause =
                clauses.length === 0
                    ? undefined
                    : clauses.length === 1
                        ? clauses[0]
                        : and(...clauses);

            const rows = await this.db
                .select()
                .from(capabilities)
                .where(whereClause)
                .orderBy(desc(capabilities.createdAt))
                .limit(filters.limit ?? 100);

            if (!filters.securityLevel) {
                return rows;
            }

            return rows.filter(
                (row) =>
                    typeof row.metadata?.securityLevel === 'string' &&
                    row.metadata.securityLevel === filters.securityLevel
            );
        } catch (error: unknown) {
            logger.error('CapabilityRepository.searchCapabilities failed', {
                filters,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async getCapabilitiesByIds(ids: string[]): Promise<CapabilityRow[]> {
        try {
            if (ids.length === 0) {
                return [];
            }

            return this.db
                .select()
                .from(capabilities)
                .where(inArray(capabilities.id, ids))
                .orderBy(desc(capabilities.createdAt));
        } catch (error: unknown) {
            logger.error('CapabilityRepository.getCapabilitiesByIds failed', {
                ids,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async getCapabilityById(id: string): Promise<CapabilityRow | null> {
        try {
            return await this.findById(id);
        } catch (error: unknown) {
            logger.error('CapabilityRepository.getCapabilityById failed', {
                id,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async getCapabilityDependencies(ids: string[]): Promise<CapabilityRow[]> {
        try {
            return await this.getCapabilitiesByIds(ids);
        } catch (error: unknown) {
            logger.error('CapabilityRepository.getCapabilityDependencies failed', {
                ids,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async getCapabilityDependents(capabilityId: string): Promise<CapabilityRow[]> {
        try {
            const allCapabilities = await this.db.select().from(capabilities);

            return allCapabilities.filter((row) => {
                const metadataDependencies = row.metadata?.dependencies;
                if (!Array.isArray(metadataDependencies)) {
                    return false;
                }

                return metadataDependencies.some(
                    (dependency) => typeof dependency === 'string' && dependency === capabilityId
                );
            });
        } catch (error: unknown) {
            logger.error('CapabilityRepository.getCapabilityDependents failed', {
                capabilityId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async searchCapabilitiesAdvanced(
        params: CapabilitySearchParams
    ): Promise<{ capabilities: CapabilityRow[]; totalCount: number }> {
        try {
            const clauses: SQL<unknown>[] = [];

            if (params.types && params.types.length > 0) {
                clauses.push(inArray(capabilities.type, params.types));
            }

            if (params.query) {
                const pattern = `%${params.query}%`;
                clauses.push(or(ilike(capabilities.name, pattern), ilike(capabilities.description, pattern))!);
            }

            const whereClause =
                clauses.length === 0
                    ? undefined
                    : clauses.length === 1
                        ? clauses[0]
                        : and(...clauses);

            const baseRows = await this.db.select().from(capabilities).where(whereClause);

            const filteredRows = baseRows.filter((row) => {
                if (params.securityLevel) {
                    if (
                        typeof row.metadata?.securityLevel !== 'string' ||
                        row.metadata.securityLevel !== params.securityLevel
                    ) {
                        return false;
                    }
                }

                if (params.tags && params.tags.length > 0) {
                    const tags = row.metadata?.tags;
                    if (!Array.isArray(tags)) {
                        return false;
                    }

                    const hasAllTags = params.tags.every((tag) =>
                        tags.some((existingTag) => typeof existingTag === 'string' && existingTag === tag)
                    );
                    if (!hasAllTags) {
                        return false;
                    }
                }

                if (!params.includeExperimental) {
                    const status = row.metadata?.status;
                    if (status === 'experimental') {
                        return false;
                    }
                }

                return true;
            });

            const totalCount = filteredRows.length;
            const offset = params.offset ?? 0;
            const limit = params.limit ?? 20;
            const paginated = filteredRows.slice(offset, offset + limit);

            return { capabilities: paginated, totalCount };
        } catch (error: unknown) {
            logger.error('CapabilityRepository.searchCapabilitiesAdvanced failed', {
                params,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async count(): Promise<number> {
        try {
            const [result] = await this.db.select({ value: count() }).from(capabilities);
            return Number(result?.value ?? 0);
        } catch (error: unknown) {
            logger.error('CapabilityRepository.count failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
}
