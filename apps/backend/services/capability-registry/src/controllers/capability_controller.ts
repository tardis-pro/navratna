import { logger } from '@uaip/utils';
import { CapabilityDiscoveryService, SecurityValidationService } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/infra/database';
import {
  Capability,
  CapabilityType,
  SecurityLevel,
  SecurityContext,
  CapabilitySearchQuery,
} from '@uaip/types';

interface ElysiaContext {
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, unknown>;
  set: { status: number };
}

function getIdParam(params: Record<string, unknown> | undefined): string {
  return typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';
}

function requireCapabilityId(
  id: string,
  set: { status: number }
): { success: false; error: string } | null {
  if (!id) {
    set.status = 400;
    return { success: false, error: 'Capability ID is required' };
  }
  return null;
}

function registryMeta(extra?: Record<string, unknown>) {
  return { ...extra, timestamp: new Date(), service: 'capability-registry' };
}

export class CapabilityController {
  private capabilityDiscoveryService: CapabilityDiscoveryService;
  private securityValidationService: SecurityValidationService;

  constructor(_databaseService?: DatabaseService) {
    this.capabilityDiscoveryService = new CapabilityDiscoveryService();
    this.securityValidationService = new SecurityValidationService();
  }

  public searchCapabilities = async ({ query, headers, set }: ElysiaContext) => {
    const q = query ?? {};
    const h = headers ?? {};
    const { query: qParam, type, limit = 50 } = q;

    if (!qParam || typeof qParam !== 'string') {
      set.status = 400;
      return { success: false, error: 'Query parameter is required' };
    }

    const searchQuery: CapabilitySearchQuery = {
      query: qParam as string,
      type: type as CapabilityType,
      limit: parseInt(limit as string, 10),
    };

    const securityContext = this.extractSecurityContext(h);

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_search',
      ['capabilities'],
      searchQuery
    );

    const capabilities = await this.capabilityDiscoveryService.searchCapabilities(searchQuery);

    return {
      success: true,
      data: {
        capabilities,
        totalCount: capabilities.length,
        recommendations: [] as unknown[],
      },
      meta: {
        query: searchQuery,
        timestamp: new Date(),
        service: 'capability-registry',
      },
    };
  };

  public registerCapability = async ({ body, headers, set }: ElysiaContext) => {
    const capability = body as Capability;

    if (!capability) {
      set.status = 400;
      return { success: false, error: 'Capability definition is required' };
    }

    const securityContext = this.extractSecurityContext(headers ?? {});

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_register',
      ['capabilities'],
      capability
    );

    logger.info('Capability registration requested', {
      capabilityName: capability.name,
      userId: securityContext.userId,
    });

    set.status = 201;
    return {
      success: true,
      data: { capability },
      meta: registryMeta(),
    };
  };

  public getCapability = async ({ params, headers, set }: ElysiaContext) => {
    const id = getIdParam(params);

    const idError = requireCapabilityId(id, set);
    if (idError) return idError;

    const securityContext = this.extractSecurityContext(headers ?? {});

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_read',
      [`capability:${id}`],
      { capabilityId: id }
    );

    const capability = await this.capabilityDiscoveryService.getCapabilityById(id);

    if (!capability) {
      set.status = 404;
      return { success: false, error: 'Capability not found' };
    }

    return {
      success: true,
      data: { capability },
      meta: registryMeta(),
    };
  };

  public listCapabilities = async ({ query, headers, set: _set }: ElysiaContext) => {
    const q = query ?? {};
    const { query: qParam = '*', type, limit = 50 } = q;

    const securityContext = this.extractSecurityContext(headers ?? {});

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_read',
      ['capabilities'],
      { query: qParam, type, limit }
    );

    const capabilities = await this.capabilityDiscoveryService.searchCapabilities({
      query: typeof qParam === 'string' && qParam.length > 0 ? qParam : '*',
      type: type as CapabilityType,
      limit: parseInt(limit as string, 10),
    });

    return {
      success: true,
      data: { capabilities, totalCount: capabilities.length },
      meta: registryMeta(),
    };
  };

  public executeCapability = async ({ params, body, headers, set }: ElysiaContext) => {
    const id = getIdParam(params);

    const idError = requireCapabilityId(id, set);
    if (idError) return idError;

    const securityContext = this.extractSecurityContext(headers ?? {});

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_execute',
      [`capability:${id}`],
      body
    );

    const execution = await this.capabilityDiscoveryService.executeTool(
      id,
      (body && typeof body === 'object' ? body : {}) as Record<string, unknown>,
      {
        agentId: (headers ?? {})['x-agent-id'] as string,
        userId: securityContext.userId,
        context: 'capability-execution',
        timestamp: new Date().toISOString(),
      }
    );

    return {
      success: true,
      data: { execution },
      meta: registryMeta({ capabilityId: id }),
    };
  };

  public updateCapability = async ({ params, body, headers, set }: ElysiaContext) => {
    const id = getIdParam(params);
    const updateData = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

    const idError = requireCapabilityId(id, set);
    if (idError) return idError;

    const securityContext = this.extractSecurityContext(headers ?? {});

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_update',
      [`capability:${id}`],
      updateData
    );

    logger.info('Capability update requested', {
      capabilityId: id,
      userId: securityContext.userId,
    });

    return {
      success: true,
      data: { capability: { id, ...updateData } },
      meta: registryMeta(),
    };
  };

  public deleteCapability = async ({ params, headers, set }: ElysiaContext) => {
    const id = getIdParam(params);

    const idError = requireCapabilityId(id, set);
    if (idError) return idError;

    const securityContext = this.extractSecurityContext(headers ?? {});

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_delete',
      [`capability:${id}`],
      { capabilityId: id }
    );

    logger.info('Capability deletion requested', {
      capabilityId: id,
      userId: securityContext.userId,
    });

    set.status = 204;
    return;
  };

  public getCategories = async ({ headers, set: _set }: ElysiaContext) => {
    const securityContext = this.extractSecurityContext(headers ?? {});

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_read',
      ['capabilities'],
      {}
    );

    const allCapabilities = await this.capabilityDiscoveryService.searchCapabilities({
      limit: 1000,
    });
    const categorySet = new Set<string>(
      allCapabilities
        .map((c) => (c as { category?: string }).category)
        .filter((cat): cat is string => Boolean(cat))
    );

    const fallbackCategories = [
      'data-processing',
      'communication',
      'analysis',
      'automation',
      'integration',
      'security',
      'monitoring',
    ];
    const categories: string[] =
      categorySet.size > 0 ? Array.from(categorySet).sort() : fallbackCategories;

    return {
      success: true,
      data: { categories },
      meta: registryMeta(),
    };
  };

  public getCapabilityDependencies = async ({ params, headers, set }: ElysiaContext) => {
    const id = getIdParam(params);

    const idError = requireCapabilityId(id, set);
    if (idError) return idError;

    const securityContext = this.extractSecurityContext(headers ?? {});

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_read',
      [`capability:${id}`],
      { capabilityId: id }
    );

    const dependencies = await this.capabilityDiscoveryService.getCapabilityDependencies(id);

    return {
      success: true,
      data: { dependencies },
      meta: registryMeta({ capabilityId: id }),
    };
  };

  public validateCapability = async ({ params, body, headers, set }: ElysiaContext) => {
    const id = getIdParam(params);

    const idError = requireCapabilityId(id, set);
    if (idError) return idError;

    const securityContext = this.extractSecurityContext(headers ?? {});

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_validate',
      [`capability:${id}`],
      body
    );

    const validationResult = {
      valid: true,
      issues: [] as string[],
      recommendations: [] as string[],
    };

    return {
      success: true,
      data: { validationResult },
      meta: registryMeta({ capabilityId: id }),
    };
  };

  public getRecommendations = async ({ query, headers, set: _set }: ElysiaContext) => {
    const q = query ?? {};
    const { context, intent } = q;

    const securityContext = this.extractSecurityContext(headers ?? {});

    await this.securityValidationService.validateOperation(
      securityContext,
      'capability_read',
      ['capabilities'],
      { context, intent }
    );

    const recommendations: unknown[] = [];

    return {
      success: true,
      data: { recommendations },
      meta: registryMeta(),
    };
  };

  private extractSecurityContext(headers: Record<string, unknown>): SecurityContext {
    return {
      userId: (headers['x-user-id'] as string) || 'anonymous',
      sessionId: (headers['x-session-id'] as string) || 'unknown',
      role: (headers['x-user-role'] as string) || 'user',
      permissions: [],
      securityLevel: SecurityLevel.MEDIUM,
      lastAuthentication: new Date(),
      mfaVerified: false,
      riskScore: 0,
      ipAddress: undefined,
      userAgent: typeof headers['user-agent'] === 'string' ? headers['user-agent'] : '',
    };
  }
}
