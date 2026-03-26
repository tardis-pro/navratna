import { BaseRepository } from '../base/base_repository';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';

export class CapabilityRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'capabilities';
  }
  get plane(): 'control' {
    return 'control';
  }

  async searchCapabilities(filters: {
    query?: string;
    type?: string;
    securityLevel?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    const conditions: Record<string, unknown> = {};
    if (filters.type) conditions.type = filters.type;
    if (filters.securityLevel) conditions.security_level = filters.securityLevel;

    let results = await this.findMany(conditions);

    // Filter by query text (name or description contains query)
    if (filters.query) {
      const q = filters.query.toLowerCase();
      results = results.filter((r) => {
        const name = ((r.name as string) || '').toLowerCase();
        const description = ((r.description as string) || '').toLowerCase();
        return name.includes(q) || description.includes(q);
      });
    }

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  async getCapabilitiesByIds(ids: string[]): Promise<Record<string, unknown>[]> {
    if (ids.length === 0) return [];
    const results: Record<string, unknown>[] = [];
    for (const id of ids) {
      const row = await this.findById(id);
      if (row) results.push(row);
    }
    return results;
  }

  async getCapabilityById(id: string): Promise<Record<string, unknown> | null> {
    return this.findById(id);
  }

  async getCapabilityDependencies(ids: string[]): Promise<Record<string, unknown>[]> {
    if (ids.length === 0) return [];
    const results: Record<string, unknown>[] = [];
    for (const id of ids) {
      const row = await this.findById(id);
      if (row) results.push(row);
    }
    return results;
  }

  async getCapabilityDependents(capabilityId: string): Promise<Record<string, unknown>[]> {
    // Find capabilities that have this capabilityId in their dependencies
    const all = await this.findMany({});
    return all.filter((r) => {
      const deps = (r.dependencies as string[]) || [];
      return deps.includes(capabilityId);
    });
  }

  async searchCapabilitiesAdvanced(params: {
    query?: string;
    types?: string[];
    tags?: string[];
    securityLevel?: string;
    agentId?: string;
    includeExperimental?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ capabilities: Record<string, unknown>[]; totalCount: number }> {
    let results = await this.findMany({});

    // Filter by types
    if (params.types && params.types.length > 0) {
      results = results.filter((r) => params.types!.includes(r.type as string));
    }

    // Filter by query text
    if (params.query) {
      const q = params.query.toLowerCase();
      results = results.filter((r) => {
        const name = ((r.name as string) || '').toLowerCase();
        const description = ((r.description as string) || '').toLowerCase();
        return name.includes(q) || description.includes(q);
      });
    }

    // Filter by security level
    if (params.securityLevel) {
      results = results.filter((r) => r.security_level === params.securityLevel);
    }

    // Filter experimental if not included
    if (!params.includeExperimental) {
      results = results.filter((r) => r.status !== 'experimental');
    }

    const totalCount = results.length;

    // Apply offset and limit
    if (params.offset) {
      results = results.slice(params.offset);
    }
    if (params.limit) {
      results = results.slice(0, params.limit);
    }

    return { capabilities: results, totalCount };
  }
}
