import { EventBusService } from '../eventBusService';
import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface TaskNode {
  id: string;
  description: string;
  type: 'query' | 'command' | 'monitor' | 'orchestrate' | 'communicate';
  dependencies: string[]; // IDs of tasks that must complete first
  estimatedDurationMs?: number;
  toolId?: string; // capability to execute this
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface TaskDAG {
  id: string;
  goal: string;
  nodes: TaskNode[];
  edges: Array<{ from: string; to: string }>;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

interface DecomposeResponseNode {
  description: string;
  type: TaskNode['type'];
  dependencies: number[]; // index-based references from LLM
  estimatedDurationMs?: number;
  toolId?: string;
}

// ============================================================================
// Task DAG Service
// ============================================================================

export class TaskDAGService {
  private static instance: TaskDAGService;
  private eventBus: EventBusService;
  private activeDAGs: Map<string, TaskDAG> = new Map();

  constructor(eventBus?: EventBusService) {
    this.eventBus = eventBus ?? EventBusService.getInstance();
  }

  static getInstance(): TaskDAGService {
    if (!TaskDAGService.instance) {
      TaskDAGService.instance = new TaskDAGService();
    }
    return TaskDAGService.instance;
  }

  // --------------------------------------------------------------------------
  // Decompose: Natural Language → Task DAG
  // --------------------------------------------------------------------------

  async decompose(goal: string): Promise<TaskDAG> {
    logger.info('[TaskDAGService] Decomposing goal into DAG', { goal });

    const prompt = this.buildDecomposePrompt(goal);
    const requestId = uuidv4();

    try {
      const rawResponse = await this.requestLLMCompletion(prompt, requestId);
      const dag = this.parseDAGResponse(rawResponse, goal);

      const validation = this.validateDAG(dag);
      if (!validation.valid) {
        logger.warn('[TaskDAGService] DAG validation failed, attempting repair', {
          errors: validation.errors,
        });
        this.repairDAG(dag);
        const revalidation = this.validateDAG(dag);
        if (!revalidation.valid) {
          throw new Error(`DAG validation failed after repair: ${revalidation.errors.join('; ')}`);
        }
      }

      this.activeDAGs.set(dag.id, dag);

      this.eventBus.publish('taskdag.created', {
        dagId: dag.id,
        goal: dag.goal,
        nodeCount: dag.nodes.length,
        edgeCount: dag.edges.length,
        timestamp: new Date().toISOString(),
      });

      logger.info('[TaskDAGService] DAG created', {
        dagId: dag.id,
        nodes: dag.nodes.length,
        edges: dag.edges.length,
      });

      return dag;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[TaskDAGService] Decomposition failed', { goal, error: message });
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Execution Order: Topological Sort into Parallel Batches
  // --------------------------------------------------------------------------

  getExecutionOrder(dag: TaskDAG): TaskNode[][] {
    const nodeMap = new Map<string, TaskNode>();
    for (const node of dag.nodes) {
      nodeMap.set(node.id, node);
    }

    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of dag.nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of dag.edges) {
      const current = inDegree.get(edge.to) ?? 0;
      inDegree.set(edge.to, current + 1);
      const adj = adjacency.get(edge.from) ?? [];
      adj.push(edge.to);
      adjacency.set(edge.from, adj);
    }

    const batches: TaskNode[][] = [];
    const remaining = new Set(dag.nodes.map((n) => n.id));

    while (remaining.size > 0) {
      const batch: TaskNode[] = [];
      for (const id of remaining) {
        if ((inDegree.get(id) ?? 0) === 0) {
          const node = nodeMap.get(id);
          if (node) batch.push(node);
        }
      }

      if (batch.length === 0) {
        logger.error('[TaskDAGService] Cycle detected during topological sort');
        // Break deadlock: pick an arbitrary remaining node
        const nextId = remaining.values().next().value;
        if (nextId !== undefined) {
          const node = nodeMap.get(nextId);
          if (node) batch.push(node);
        }
        if (batch.length === 0) break;
      }

      batches.push(batch);

      for (const node of batch) {
        remaining.delete(node.id);
        const successors = adjacency.get(node.id) ?? [];
        for (const succ of successors) {
          const deg = inDegree.get(succ) ?? 1;
          inDegree.set(succ, deg - 1);
        }
      }
    }

    return batches;
  }

  // --------------------------------------------------------------------------
  // Execute DAG: Batch-by-Batch Sequential Execution
  // --------------------------------------------------------------------------

  async executeDAG(dag: TaskDAG): Promise<TaskDAG> {
    logger.info('[TaskDAGService] Starting DAG execution', { dagId: dag.id });
    dag.status = 'executing';
    this.activeDAGs.set(dag.id, dag);

    const batches = this.getExecutionOrder(dag);

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        logger.info('[TaskDAGService] Executing batch', {
          dagId: dag.id,
          batchIndex,
          taskCount: batch.length,
          taskIds: batch.map((n) => n.id),
        });

        // oxlint-ignore-next-line no-await-in-loop -- sequential processing required
        const results = await Promise.allSettled(batch.map((node) => this.executeNode(dag, node)));

        let batchFailed = false;
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const node = batch[i];

          if (result.status === 'rejected') {
            node.status = 'failed';
            node.error =
              result.reason instanceof Error ? result.reason.message : String(result.reason);
            node.completedAt = new Date();
            batchFailed = true;

            logger.error('[TaskDAGService] Task failed', {
              dagId: dag.id,
              taskId: node.id,
              error: node.error,
            });
          }

          this.eventBus.publish('taskdag.step.completed', {
            dagId: dag.id,
            taskId: node.id,
            status: node.status,
            batchIndex,
            result: node.result,
            error: node.error,
            timestamp: new Date().toISOString(),
          });
        }

        if (batchFailed) {
          // Skip downstream dependents of failed tasks
          this.skipDependents(
            dag,
            batch.filter((n) => n.status === 'failed')
          );
        }
      }

      const hasFailed = dag.nodes.some((n) => n.status === 'failed');
      const allSkippedOrCompleted = dag.nodes.every(
        (n) => n.status === 'completed' || n.status === 'skipped'
      );

      if (hasFailed && !allSkippedOrCompleted) {
        dag.status = 'failed';
      } else {
        dag.status = 'completed';
      }

      dag.completedAt = new Date();
      this.activeDAGs.set(dag.id, dag);

      const eventName = dag.status === 'completed' ? 'taskdag.completed' : 'taskdag.failed';
      this.eventBus.publish(eventName, {
        dagId: dag.id,
        goal: dag.goal,
        status: dag.status,
        nodeStatuses: dag.nodes.map((n) => ({ id: n.id, status: n.status })),
        timestamp: new Date().toISOString(),
      });

      logger.info('[TaskDAGService] DAG execution finished', {
        dagId: dag.id,
        status: dag.status,
      });

      return dag;
    } catch (error) {
      dag.status = 'failed';
      dag.completedAt = new Date();
      this.activeDAGs.set(dag.id, dag);

      const message = error instanceof Error ? error.message : String(error);
      this.eventBus.publish('taskdag.failed', {
        dagId: dag.id,
        goal: dag.goal,
        error: message,
        timestamp: new Date().toISOString(),
      });

      logger.error('[TaskDAGService] DAG execution error', {
        dagId: dag.id,
        error: message,
      });

      return dag;
    }
  }

  // --------------------------------------------------------------------------
  // LLM Prompt Construction
  // --------------------------------------------------------------------------

  buildDecomposePrompt(goal: string): string {
    return `You are a task decomposition engine. Given a high-level goal, break it into atomic sub-tasks with dependencies.

## Instructions
- Return a JSON array of task objects.
- Each task has: "description" (string), "type" (one of: "query", "command", "monitor", "orchestrate", "communicate"), "dependencies" (array of zero-based task indices that must finish first), "estimatedDurationMs" (number, optional), "toolId" (string, optional capability ID).
- Tasks should be atomic and independently executable where possible.
- Maximize parallelism: only add a dependency if the task truly needs the output of another.
- Order tasks logically; the first task should have no dependencies.
- Do NOT include wrapper text. Return ONLY a valid JSON array.

## Goal
${goal}

## Response Format
\`\`\`json
[
  {
    "description": "First atomic task",
    "type": "query",
    "dependencies": [],
    "estimatedDurationMs": 5000
  },
  {
    "description": "Second task depending on first",
    "type": "command",
    "dependencies": [0],
    "estimatedDurationMs": 10000
  }
]
\`\`\``;
  }

  // --------------------------------------------------------------------------
  // Parse LLM Response → TaskDAG
  // --------------------------------------------------------------------------

  parseDAGResponse(raw: string, goal: string): TaskDAG {
    // Extract JSON array from potential markdown code fences
    let jsonStr = raw.trim();
    const fencedMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fencedMatch) {
      jsonStr = fencedMatch[1].trim();
    }

    let parsed: DecomposeResponseNode[];
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error(`Failed to parse DAG response as JSON: ${jsonStr.slice(0, 200)}`);
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('DAG response must be a non-empty JSON array');
    }

    const dagId = uuidv4();
    const nodeIds: string[] = parsed.map(() => uuidv4());

    const validTypes = new Set<TaskNode['type']>([
      'query',
      'command',
      'monitor',
      'orchestrate',
      'communicate',
    ]);

    const nodes: TaskNode[] = parsed.map((item, index) => {
      const nodeType = validTypes.has(item.type) ? item.type : 'command';
      const deps = (item.dependencies ?? [])
        .filter((depIdx: number) => depIdx >= 0 && depIdx < parsed.length && depIdx !== index)
        .map((depIdx: number) => nodeIds[depIdx]);

      return {
        id: nodeIds[index],
        description: String(item.description || `Task ${index + 1}`),
        type: nodeType,
        dependencies: deps,
        estimatedDurationMs: item.estimatedDurationMs ?? undefined,
        toolId: item.toolId ?? undefined,
        status: 'pending' as const,
      };
    });

    const edges: TaskDAG['edges'] = [];
    for (const node of nodes) {
      for (const dep of node.dependencies) {
        edges.push({ from: dep, to: node.id });
      }
    }

    return {
      id: dagId,
      goal,
      nodes,
      edges,
      status: 'planning',
      createdAt: new Date(),
    };
  }

  // --------------------------------------------------------------------------
  // DAG Validation
  // --------------------------------------------------------------------------

  validateDAG(dag: TaskDAG): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const nodeIds = new Set(dag.nodes.map((n) => n.id));

    // Check for duplicate IDs
    if (nodeIds.size !== dag.nodes.length) {
      errors.push('Duplicate node IDs detected');
    }

    // Check for missing dependency references
    for (const node of dag.nodes) {
      for (const dep of node.dependencies) {
        if (!nodeIds.has(dep)) {
          errors.push(`Node "${node.id}" depends on non-existent node "${dep}"`);
        }
      }
    }

    // Check edges reference valid nodes
    for (const edge of dag.edges) {
      if (!nodeIds.has(edge.from)) {
        errors.push(`Edge references non-existent source node "${edge.from}"`);
      }
      if (!nodeIds.has(edge.to)) {
        errors.push(`Edge references non-existent target node "${edge.to}"`);
      }
    }

    // Check for orphan nodes (no edges and not root)
    if (dag.nodes.length > 1) {
      const connectedNodes = new Set<string>();
      for (const edge of dag.edges) {
        connectedNodes.add(edge.from);
        connectedNodes.add(edge.to);
      }
      // Nodes with no dependencies and not referenced by any edge are roots — fine
      // Nodes with no connections at all in a multi-node DAG are orphans
      for (const node of dag.nodes) {
        if (!connectedNodes.has(node.id) && dag.nodes.length > 1) {
          // Only warn; a standalone node with no deps is a valid root
          if (node.dependencies.length === 0) continue;
          errors.push(`Orphan node detected: "${node.id}" (${node.description})`);
        }
      }
    }

    // Cycle detection using DFS
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const adjacency = new Map<string, string[]>();

    for (const node of dag.nodes) {
      adjacency.set(node.id, []);
    }
    for (const edge of dag.edges) {
      const adj = adjacency.get(edge.from);
      if (adj) adj.push(edge.to);
    }

    const hasCycle = (nodeId: string): boolean => {
      if (visiting.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visiting.add(nodeId);
      const neighbors = adjacency.get(nodeId) ?? [];
      for (const neighbor of neighbors) {
        if (hasCycle(neighbor)) return true;
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      return false;
    };

    for (const node of dag.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycle(node.id)) {
          errors.push('Cycle detected in DAG');
          break;
        }
      }
    }

    // Must have at least one root node (no dependencies)
    const hasRoot = dag.nodes.some((n) => n.dependencies.length === 0);
    if (!hasRoot) {
      errors.push('DAG has no root node (every node has dependencies)');
    }

    return { valid: errors.length === 0, errors };
  }

  // --------------------------------------------------------------------------
  // DAG Accessors
  // --------------------------------------------------------------------------

  getDAG(dagId: string): TaskDAG | undefined {
    return this.activeDAGs.get(dagId);
  }

  getAllDAGs(): TaskDAG[] {
    return Array.from(this.activeDAGs.values());
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private async executeNode(dag: TaskDAG, node: TaskNode): Promise<void> {
    node.status = 'running';
    node.startedAt = new Date();

    logger.info('[TaskDAGService] Executing task', {
      dagId: dag.id,
      taskId: node.id,
      description: node.description,
      type: node.type,
    });

    try {
      const result = await this.dispatchTask(node);
      node.status = 'completed';
      node.result = result;
      node.completedAt = new Date();
    } catch (error) {
      throw error; // Rethrown to be caught by Promise.allSettled
    }
  }

  private async dispatchTask(node: TaskNode): Promise<unknown> {
    // Dispatch to appropriate handler based on task type
    // Each handler communicates via event bus to the relevant service
    return new Promise<unknown>((resolve, reject) => {
      const timeoutMs = node.estimatedDurationMs
        ? Math.max(node.estimatedDurationMs * 3, 30000)
        : 60000;

      const requestId = uuidv4();
      const responseEvent = `task.execution.response.${requestId}`;

      const timeout = setTimeout(() => {
        this.eventBus.unsubscribe(responseEvent);
        reject(new Error(`Task "${node.description}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.eventBus.subscribe(responseEvent, (data: { result?: unknown; error?: string }) => {
        clearTimeout(timeout);
        this.eventBus.unsubscribe(responseEvent);
        if (data.error) {
          reject(new Error(data.error));
        } else {
          resolve(data.result);
        }
      });

      this.eventBus.publish('task.execution.request', {
        requestId,
        taskId: node.id,
        description: node.description,
        type: node.type,
        toolId: node.toolId,
        responseEvent,
      });
    });
  }

  private skipDependents(dag: TaskDAG, failedNodes: TaskNode[]): void {
    const failedIds = new Set(failedNodes.map((n) => n.id));
    const toSkip = new Set<string>();

    // BFS to find all transitive dependents
    const queue = [...failedIds];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const edge of dag.edges) {
        if (edge.from === currentId && !toSkip.has(edge.to) && !failedIds.has(edge.to)) {
          toSkip.add(edge.to);
          queue.push(edge.to);
        }
      }
    }

    for (const node of dag.nodes) {
      if (toSkip.has(node.id) && node.status === 'pending') {
        node.status = 'skipped';
        logger.info('[TaskDAGService] Skipping dependent task', {
          dagId: dag.id,
          taskId: node.id,
          description: node.description,
        });
      }
    }
  }

  private repairDAG(dag: TaskDAG): void {
    const nodeIds = new Set(dag.nodes.map((n) => n.id));

    // Remove references to non-existent nodes
    for (const node of dag.nodes) {
      node.dependencies = node.dependencies.filter((dep) => nodeIds.has(dep));
    }
    dag.edges = dag.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

    // Break cycles by removing back edges (simple heuristic: remove last edge forming cycle)
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const adjacency = new Map<string, string[]>();

    for (const node of dag.nodes) {
      adjacency.set(node.id, []);
    }
    for (const edge of dag.edges) {
      adjacency.get(edge.from)?.push(edge.to);
    }

    const edgesToRemove: Array<{ from: string; to: string }> = [];

    const dfs = (nodeId: string): void => {
      visiting.add(nodeId);
      const neighbors = adjacency.get(nodeId) ?? [];
      for (const neighbor of neighbors) {
        if (visiting.has(neighbor)) {
          edgesToRemove.push({ from: nodeId, to: neighbor });
        } else if (!visited.has(neighbor)) {
          dfs(neighbor);
        }
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
    };

    for (const node of dag.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }

    for (const badEdge of edgesToRemove) {
      dag.edges = dag.edges.filter((e) => !(e.from === badEdge.from && e.to === badEdge.to));
      const targetNode = dag.nodes.find((n) => n.id === badEdge.to);
      if (targetNode) {
        targetNode.dependencies = targetNode.dependencies.filter((d) => d !== badEdge.from);
      }
    }
  }

  private async requestLLMCompletion(prompt: string, requestId: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const responseEvent = `llm.completion.response.${requestId}`;
      const timeoutMs = 60000;

      const timeout = setTimeout(() => {
        this.eventBus.unsubscribe(responseEvent);
        reject(new Error('LLM completion request timed out'));
      }, timeoutMs);

      this.eventBus.subscribe(responseEvent, (data: { content?: string; error?: string }) => {
        clearTimeout(timeout);
        this.eventBus.unsubscribe(responseEvent);
        if (data.error) {
          reject(new Error(data.error));
        } else {
          resolve(data.content ?? '');
        }
      });

      this.eventBus.publish('llm.completion.request', {
        requestId,
        prompt,
        responseEvent,
        options: {
          temperature: 0.3,
          maxTokens: 4096,
        },
      });
    });
  }
}
