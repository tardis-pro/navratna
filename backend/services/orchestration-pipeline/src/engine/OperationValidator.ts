/**
 * Operation Validator
 * Handles validation of operations before execution
 */

import { Operation, OperationError } from '@uaip/types';
import { logger } from '@uaip/utils';
import { z } from 'zod';

export class OperationValidator {
  private readonly maxSteps = 100;
  private readonly maxOperationTimeout = 24 * 60 * 60 * 1000; // 24 hours

  async validateOperation(operation: Operation): Promise<void> {
    logger.debug('Validating operation', { operationId: operation.id });

    // Basic validation
    if (!operation.id) {
      throw new OperationError('Operation ID is required', 'VALIDATION_ERROR');
    }

    if (!operation.type) {
      throw new OperationError('Operation type is required', 'VALIDATION_ERROR');
    }

    if (!operation.agentId) {
      throw new OperationError('Agent ID is required', 'VALIDATION_ERROR');
    }

    if (!operation.steps || operation.steps.length === 0) {
      throw new OperationError('Operation must have at least one step', 'VALIDATION_ERROR');
    }

    if (operation.steps.length > this.maxSteps) {
      throw new OperationError(
        `Operation cannot have more than ${this.maxSteps} steps`,
        'VALIDATION_ERROR'
      );
    }

    // Validate timeout
    if (operation.timeout && operation.timeout > this.maxOperationTimeout) {
      throw new OperationError(
        `Operation timeout cannot exceed ${this.maxOperationTimeout}ms`,
        'VALIDATION_ERROR'
      );
    }

    // Validate each step
    for (const step of operation.steps) {
      await this.validateStep(step);
    }

    // Validate step dependencies
    this.validateStepDependencies(operation);
  }

  private async validateStep(step: any): Promise<void> {
    if (!step.id) {
      throw new OperationError('Step ID is required', 'VALIDATION_ERROR');
    }

    if (!step.name) {
      throw new OperationError(`Step ${step.id} must have a name`, 'VALIDATION_ERROR');
    }

    if (!step.type) {
      throw new OperationError(`Step ${step.id} must have a type`, 'VALIDATION_ERROR');
    }

    // Validate step schema based on type
    await this.validateStepSchema(step);
  }

  private async validateStepSchema(step: any): Promise<void> {
    // Define schemas for different step types
    const schemas: Record<string, z.ZodSchema> = {
      'agent-action': z.object({
        id: z.string(),
        name: z.string(),
        type: z.literal('agent-action'),
        agentId: z.string(),
        action: z.string(),
        parameters: z.any().optional(),
        timeout: z.number().optional(),
        retryPolicy: z
          .object({
            maxRetries: z.number(),
            backoffMultiplier: z.number().optional(),
          })
          .optional(),
      }),
      'tool-execution': z.object({
        id: z.string(),
        name: z.string(),
        type: z.literal('tool-execution'),
        toolId: z.string(),
        input: z.any(),
        timeout: z.number().optional(),
      }),
      conditional: z.object({
        id: z.string(),
        name: z.string(),
        type: z.literal('conditional'),
        condition: z.string(),
        trueBranch: z.array(z.string()),
        falseBranch: z.array(z.string()).optional(),
      }),
      parallel: z.object({
        id: z.string(),
        name: z.string(),
        type: z.literal('parallel'),
        branches: z.array(z.array(z.string())),
        policy: z.enum(['all-success', 'any-success', 'best-effort']).optional(),
      }),
    };

    const schema = schemas[step.type];
    if (schema) {
      try {
        schema.parse(step);
      } catch (error) {
        throw new OperationError(
          `Invalid step schema for ${step.id}: ${error.message}`,
          'VALIDATION_ERROR'
        );
      }
    }
  }

  private validateStepDependencies(operation: Operation): void {
    const stepIds = new Set(operation.steps.map((s) => s.id));
    const visited = new Set<string>();
    const visiting = new Set<string>();

    // Check for circular dependencies
    for (const step of operation.steps) {
      if (!visited.has(step.id)) {
        this.checkCircularDependencies(step, operation.steps, visited, visiting);
      }
    }

    // Validate all dependencies exist
    for (const step of operation.steps) {
      if (step.dependsOn) {
        for (const depId of step.dependsOn) {
          if (!stepIds.has(depId)) {
            throw new OperationError(
              `Step ${step.id} depends on non-existent step ${depId}`,
              'VALIDATION_ERROR'
            );
          }
        }
      }
    }
  }

  private checkCircularDependencies(
    step: any,
    allSteps: any[],
    visited: Set<string>,
    visiting: Set<string>
  ): void {
    if (visiting.has(step.id)) {
      throw new OperationError(
        `Circular dependency detected involving step ${step.id}`,
        'VALIDATION_ERROR'
      );
    }

    if (visited.has(step.id)) {
      return;
    }

    visiting.add(step.id);

    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        const depStep = allSteps.find((s) => s.id === depId);
        if (depStep) {
          this.checkCircularDependencies(depStep, allSteps, visited, visiting);
        }
      }
    }

    visiting.delete(step.id);
    visited.add(step.id);
  }
}
