import { EventEmitter } from 'events';
import { logger } from '@uaip/utils';
import { ResourceUsage } from '@uaip/types';

export interface ResourceLimits {
  maxMemory: number;
  maxCpu: number;
  maxDuration: number;
}

export interface ResourceAllocation {
  operationId: string;
  allocatedAt: Date;
  limits: ResourceLimits;
  currentUsage: ResourceUsage;
  released: boolean;
}

export interface ResourceAvailabilityCheck {
  available: boolean;
  reason?: string;
  availableResources?: {
    memory: number;
    cpu: number;
  };
}

export class ResourceManagerService extends EventEmitter {
  private allocatedResources = new Map<string, ResourceAllocation>();
  private systemLimits: ResourceLimits;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(systemLimits?: ResourceLimits) {
    super();
    this.systemLimits = systemLimits || {
      maxMemory: 8 * 1024 * 1024 * 1024, // 8GB
      maxCpu: 8, // 8 cores
      maxDuration: 24 * 60 * 60 * 1000 // 24 hours
    };
    
    this.startResourceMonitoring();
  }

  /**
   * Check if resources are available for allocation
   */
  public async checkResourceAvailability(
    requiredLimits: ResourceLimits
  ): Promise<ResourceAvailabilityCheck> {
    try {
      const currentUsage = this.getCurrentSystemUsage();
      
      const availableMemory = this.systemLimits.maxMemory - (currentUsage.memory || 0);
      const availableCpu = this.systemLimits.maxCpu - (currentUsage.cpu || 0);

      if (requiredLimits.maxMemory > availableMemory) {
        return {
          available: false,
          reason: `Insufficient memory. Required: ${requiredLimits.maxMemory}, Available: ${availableMemory}`,
          availableResources: { memory: availableMemory, cpu: availableCpu }
        };
      }

      if (requiredLimits.maxCpu > availableCpu) {
        return {
          available: false,
          reason: `Insufficient CPU. Required: ${requiredLimits.maxCpu}, Available: ${availableCpu}`,
          availableResources: { memory: availableMemory, cpu: availableCpu }
        };
      }

      return {
        available: true,
        availableResources: { memory: availableMemory, cpu: availableCpu }
      };

    } catch (error) {
      logger.error('Failed to check resource availability', { error: (error as Error).message });
      return {
        available: false,
        reason: 'Resource availability check failed'
      };
    }
  }

  /**
   * Allocate resources for an operation
   */
  public async allocateResources(
    operationId: string,
    limits: ResourceLimits
  ): Promise<ResourceAllocation> {
    try {
      // Check availability first
      const availabilityCheck = await this.checkResourceAvailability(limits);
      if (!availabilityCheck.available) {
        throw new Error(availabilityCheck.reason || 'Resources not available');
      }

      const allocation: ResourceAllocation = {
        operationId,
        allocatedAt: new Date(),
        limits,
        currentUsage: { cpu: 0, memory: 0, network: 0 },
        released: false
      };

      this.allocatedResources.set(operationId, allocation);

      logger.info('Resources allocated', {
        operationId,
        limits,
        totalAllocations: this.allocatedResources.size
      });

      // Emit allocation event
      this.emit('resourceAllocated', { operationId, allocation });

      return allocation;

    } catch (error) {
      logger.error('Failed to allocate resources', {
        operationId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Release resources for an operation
   */
  public async releaseResources(operationId: string): Promise<void> {
    try {
      const allocation = this.allocatedResources.get(operationId);
      if (!allocation) {
        logger.warn('No resources found for operation', { operationId });
        return;
      }

      if (allocation.released) {
        logger.warn('Resources already released for operation', { operationId });
        return;
      }

      allocation.released = true;
      this.allocatedResources.delete(operationId);

      logger.info('Resources released', {
        operationId,
        releasedLimits: allocation.limits,
        totalAllocations: this.allocatedResources.size
      });

      // Emit release event
      this.emit('resourceReleased', { operationId, allocation });

    } catch (error) {
      logger.error('Failed to release resources', {
        operationId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Update resource usage for an operation
   */
  public async updateResourceUsage(
    operationId: string,
    usage: ResourceUsage
  ): Promise<void> {
    try {
      const allocation = this.allocatedResources.get(operationId);
      if (!allocation || allocation.released) {
        logger.warn('No active allocation found for operation', { operationId });
        return;
      }

      allocation.currentUsage = usage;

      // Check if usage exceeds limits
      if ((usage.memory || 0) > allocation.limits.maxMemory) {
        logger.warn('Memory usage exceeds allocated limit', {
          operationId,
          usage: usage.memory,
          limit: allocation.limits.maxMemory
        });
        this.emit('resourceLimitExceeded', { operationId, type: 'memory', usage, limit: allocation.limits.maxMemory });
      }

      if ((usage.cpu || 0) > allocation.limits.maxCpu) {
        logger.warn('CPU usage exceeds allocated limit', {
          operationId,
          usage: usage.cpu,
          limit: allocation.limits.maxCpu
        });
        this.emit('resourceLimitExceeded', { operationId, type: 'cpu', usage, limit: allocation.limits.maxCpu });
      }

    } catch (error) {
      logger.error('Failed to update resource usage', {
        operationId,
        error: (error as Error).message
      });
    }
  }

  /**
   * Get resource allocation for an operation
   */
  public getResourceAllocation(operationId: string): ResourceAllocation | undefined {
    return this.allocatedResources.get(operationId);
  }

  /**
   * Get current system resource usage
   */
  public getCurrentSystemUsage(): ResourceUsage {
    let totalMemory = 0;
    let totalCpu = 0;
    let totalNetwork = 0;

    for (const allocation of this.allocatedResources.values()) {
      if (!allocation.released) {
        totalMemory += allocation.currentUsage?.memory || 0;
        totalCpu += allocation.currentUsage?.cpu || 0;
        totalNetwork += allocation.currentUsage?.network || 0;
      }
    }

    return {
      memory: totalMemory,
      cpu: totalCpu,
      network: totalNetwork
    };
  }

  /**
   * Get system resource statistics
   */
  public getResourceStatistics(): {
    totalAllocations: number;
    activeAllocations: number;
    systemUsage: ResourceUsage;
    systemLimits: ResourceLimits;
    availableResources: { memory: number; cpu: number };
  } {
    const systemUsage = this.getCurrentSystemUsage();
    
    return {
      totalAllocations: this.allocatedResources.size,
      activeAllocations: Array.from(this.allocatedResources.values()).filter(a => !a.released).length,
      systemUsage,
      systemLimits: this.systemLimits,
      availableResources: {
        memory: this.systemLimits.maxMemory - (systemUsage.memory || 0),
        cpu: this.systemLimits.maxCpu - (systemUsage.cpu || 0)
      }
    };
  }

  /**
   * Cleanup expired allocations
   */
  public async cleanupExpiredAllocations(): Promise<void> {
    try {
      const now = Date.now();
      const expiredOperations: string[] = [];

      for (const [operationId, allocation] of this.allocatedResources) {
        if (allocation.released) continue;

        const allocationAge = now - allocation.allocatedAt.getTime();
        if (allocationAge > allocation.limits.maxDuration) {
          expiredOperations.push(operationId);
        }
      }

      for (const operationId of expiredOperations) {
        logger.warn('Releasing expired resource allocation', { operationId });
        await this.releaseResources(operationId);
        this.emit('allocationExpired', { operationId });
      }

      if (expiredOperations.length > 0) {
        logger.info('Cleaned up expired allocations', { count: expiredOperations.length });
      }

    } catch (error) {
      logger.error('Failed to cleanup expired allocations', { error: (error as Error).message });
    }
  }

  /**
   * Start resource monitoring
   */
  private startResourceMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredAllocations();
        this.emit('resourceStatistics', this.getResourceStatistics());
      } catch (error) {
        logger.error('Resource monitoring failed', { error: (error as Error).message });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop resource monitoring
   */
  public stopResourceMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Shutdown the resource manager
   */
  public async shutdown(): Promise<void> {
    try {
      this.stopResourceMonitoring();
      
      // Release all active allocations
      const activeOperations = Array.from(this.allocatedResources.keys());
      for (const operationId of activeOperations) {
        await this.releaseResources(operationId);
      }

      this.allocatedResources.clear();
      this.removeAllListeners();

      logger.info('Resource manager shutdown completed');

    } catch (error) {
      logger.error('Error during resource manager shutdown', { error: (error as Error).message });
    }
  }
} 