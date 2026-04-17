import { logger } from '@uaip/utils';
import type { BaseAdapter } from '../types/base_adapter.js';
import type { ObservabilityAdapter } from '../types/observability_adapter.js';
import type { TicketingAdapter } from '../types/ticketing_adapter.js';
import type { SourceControlAdapter } from '../types/source_control_adapter.js';

type AnyAdapter = BaseAdapter | ObservabilityAdapter | TicketingAdapter | SourceControlAdapter;

export class AdapterRegistry {
  private static instance: AdapterRegistry | null = null;

  private adapters = new Map<string, AnyAdapter>();

  static getInstance(): AdapterRegistry {
    AdapterRegistry.instance ??= new AdapterRegistry();
    return AdapterRegistry.instance;
  }

  register(adapter: AnyAdapter): void {
    this.adapters.set(adapter.id, adapter);
    logger.info('AdapterRegistry: registered adapter', { id: adapter.id, type: adapter.type });
  }

  get<T extends AnyAdapter>(id: string): T | undefined {
    return this.adapters.get(id) as T | undefined;
  }

  getAll(): AnyAdapter[] {
    return Array.from(this.adapters.values());
  }

  getObservabilityAdapters(): ObservabilityAdapter[] {
    return this.getAll().filter((a): a is ObservabilityAdapter => 'queryErrors' in a);
  }

  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [id, adapter] of this.adapters) {
      try {
        const health = await adapter.healthCheck();
        results[id] = health.healthy;
      } catch {
        results[id] = false;
      }
    }
    return results;
  }

  async shutdownAll(): Promise<void> {
    for (const [id, adapter] of this.adapters) {
      try {
        await adapter.shutdown();
      } catch (err) {
        logger.warn('AdapterRegistry: shutdown failed', { id, error: err instanceof Error ? err.message : err });
      }
    }
    this.adapters.clear();
  }
}
