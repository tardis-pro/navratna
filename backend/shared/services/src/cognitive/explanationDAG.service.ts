import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReasoningNode {
  id: string;
  type: 'observation' | 'inference' | 'assumption' | 'conclusion' | 'evidence' | 'uncertainty';
  content: string;
  confidence: number;
  source?: string;
  timestamp: Date;
}

export interface ReasoningEdge {
  from: string;
  to: string;
  relationship: 'supports' | 'contradicts' | 'requires' | 'derives' | 'weakens';
  strength: number; // 0-1
}

export interface ExplanationDAG {
  id: string;
  agentId: string;
  taskId: string;
  nodes: ReasoningNode[];
  edges: ReasoningEdge[];
  conclusion?: ReasoningNode;
  overallConfidence: number;
  uncertainties: ReasoningNode[];
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNCERTAINTY_CONFIDENCE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * ExplanationDAGService captures real-time reasoning into a directed acyclic
 * graph that shows HOW an agent reached its conclusion. Each node represents
 * an observation, inference, assumption, or conclusion, and edges encode
 * support / contradiction / derivation relationships.
 */
export class ExplanationDAGService {
  private static instance: ExplanationDAGService;

  /** In-memory DAG storage */
  private dags: Map<string, ExplanationDAG> = new Map();

  static getInstance(): ExplanationDAGService {
    if (!ExplanationDAGService.instance) {
      ExplanationDAGService.instance = new ExplanationDAGService();
    }
    return ExplanationDAGService.instance;
  }

  // -------------------------------------------------------------------------
  // DAG Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create a new empty explanation DAG for an agent task.
   */
  createDAG(agentId: string, taskId: string): ExplanationDAG {
    const dag: ExplanationDAG = {
      id: uuidv4(),
      agentId,
      taskId,
      nodes: [],
      edges: [],
      conclusion: undefined,
      overallConfidence: 0,
      uncertainties: [],
      createdAt: new Date(),
    };

    this.dags.set(dag.id, dag);

    logger.info('Explanation DAG created', {
      dagId: dag.id,
      agentId,
      taskId,
    });

    return dag;
  }

  /**
   * Retrieve a DAG by ID. Returns undefined if not found.
   */
  getDAG(dagId: string): ExplanationDAG | undefined {
    return this.dags.get(dagId);
  }

  /**
   * Delete a DAG by ID.
   */
  deleteDAG(dagId: string): boolean {
    const deleted = this.dags.delete(dagId);
    if (deleted) {
      logger.info('Explanation DAG deleted', { dagId });
    }
    return deleted;
  }

  // -------------------------------------------------------------------------
  // Node Addition
  // -------------------------------------------------------------------------

  /**
   * Add an observation node — raw data or external fact.
   */
  addObservation(
    dagId: string,
    content: string,
    source?: string,
  ): ReasoningNode {
    const node: ReasoningNode = {
      id: uuidv4(),
      type: 'observation',
      content,
      confidence: 1.0, // Observations are taken at face value
      source,
      timestamp: new Date(),
    };

    this.addNode(dagId, node);
    return node;
  }

  /**
   * Add an inference node derived from one or more supporting nodes.
   * Automatically creates 'supports' edges from supporting nodes to this node.
   */
  addInference(
    dagId: string,
    content: string,
    supportingNodeIds: string[],
    confidence: number,
  ): ReasoningNode {
    const node: ReasoningNode = {
      id: uuidv4(),
      type: 'inference',
      content,
      confidence: this.clampConfidence(confidence),
      timestamp: new Date(),
    };

    this.addNode(dagId, node);

    // Create support edges from each supporting node
    for (const fromId of supportingNodeIds) {
      this.addEdge(dagId, {
        from: fromId,
        to: node.id,
        relationship: 'supports',
        strength: confidence,
      });
    }

    return node;
  }

  /**
   * Add an assumption node — something taken as true without direct evidence.
   */
  addAssumption(
    dagId: string,
    content: string,
    confidence: number,
  ): ReasoningNode {
    const node: ReasoningNode = {
      id: uuidv4(),
      type: 'assumption',
      content,
      confidence: this.clampConfidence(confidence),
      timestamp: new Date(),
    };

    this.addNode(dagId, node);
    return node;
  }

  /**
   * Add an evidence node — supporting data from a specific source.
   */
  addEvidence(
    dagId: string,
    content: string,
    source: string,
    confidence: number,
  ): ReasoningNode {
    const node: ReasoningNode = {
      id: uuidv4(),
      type: 'evidence',
      content,
      confidence: this.clampConfidence(confidence),
      source,
      timestamp: new Date(),
    };

    this.addNode(dagId, node);
    return node;
  }

  /**
   * Add an uncertainty node — an explicit acknowledgment of unknowns.
   */
  addUncertainty(
    dagId: string,
    content: string,
    confidence: number,
  ): ReasoningNode {
    const node: ReasoningNode = {
      id: uuidv4(),
      type: 'uncertainty',
      content,
      confidence: this.clampConfidence(confidence),
      timestamp: new Date(),
    };

    this.addNode(dagId, node);
    return node;
  }

  // -------------------------------------------------------------------------
  // Conclusion
  // -------------------------------------------------------------------------

  /**
   * Set the conclusion node for the DAG. Creates 'supports' edges from
   * supporting nodes to the conclusion.
   */
  setConclusion(
    dagId: string,
    content: string,
    supportingNodeIds: string[],
  ): ReasoningNode {
    const dag = this.requireDAG(dagId);

    const node: ReasoningNode = {
      id: uuidv4(),
      type: 'conclusion',
      content,
      confidence: 0, // Will be computed
      timestamp: new Date(),
    };

    this.addNode(dagId, node);

    // Create support edges
    for (const fromId of supportingNodeIds) {
      this.addEdge(dagId, {
        from: fromId,
        to: node.id,
        relationship: 'supports',
        strength: 1.0,
      });
    }

    // Compute confidence from supporting chain
    node.confidence = this.computeNodeConfidence(dag, node.id);
    dag.conclusion = node;
    dag.overallConfidence = this.computeOverallConfidence(dagId);
    dag.uncertainties = this.getUncertainties(dagId);

    logger.info('Conclusion set for DAG', {
      dagId,
      conclusionId: node.id,
      overallConfidence: dag.overallConfidence,
      uncertaintyCount: dag.uncertainties.length,
    });

    return node;
  }

  // -------------------------------------------------------------------------
  // Contradiction
  // -------------------------------------------------------------------------

  /**
   * Record a contradiction between two nodes with an explanation.
   */
  addContradiction(
    dagId: string,
    nodeAId: string,
    nodeBId: string,
    explanation: string,
  ): ReasoningEdge {
    this.requireDAG(dagId);

    const edge: ReasoningEdge = {
      from: nodeAId,
      to: nodeBId,
      relationship: 'contradicts',
      strength: 1.0,
    };

    this.addEdge(dagId, edge);

    // Also add an uncertainty node documenting the contradiction
    this.addUncertainty(dagId, `Contradiction: ${explanation}`, 0.3);

    logger.info('Contradiction recorded in DAG', {
      dagId,
      nodeA: nodeAId,
      nodeB: nodeBId,
      explanation,
    });

    return edge;
  }

  // -------------------------------------------------------------------------
  // Confidence Computation
  // -------------------------------------------------------------------------

  /**
   * Compute overall confidence for the DAG based on the conclusion's
   * supporting chain. If no conclusion exists, averages all node confidences.
   */
  computeOverallConfidence(dagId: string): number {
    const dag = this.requireDAG(dagId);

    if (dag.conclusion) {
      return this.computeNodeConfidence(dag, dag.conclusion.id);
    }

    // No conclusion set — average all node confidences
    if (dag.nodes.length === 0) {
      return 0;
    }

    const total = dag.nodes.reduce((sum, node) => sum + node.confidence, 0);
    return total / dag.nodes.length;
  }

  /**
   * Compute the effective confidence of a specific node by traversing its
   * supporting chain. Uses weighted average of supporters, discounted by
   * contradictions.
   */
  private computeNodeConfidence(dag: ExplanationDAG, nodeId: string): number {
    const node = dag.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return 0;
    }

    // Get all incoming 'supports' edges
    const supportEdges = dag.edges.filter(
      (e) => e.to === nodeId && e.relationship === 'supports',
    );

    // Get all incoming 'contradicts' or 'weakens' edges
    const negativeEdges = dag.edges.filter(
      (e) =>
        e.to === nodeId &&
        (e.relationship === 'contradicts' || e.relationship === 'weakens'),
    );

    if (supportEdges.length === 0) {
      // Leaf node — use its own confidence
      let confidence = node.confidence;

      // Apply contradiction discount
      for (const neg of negativeEdges) {
        confidence *= 1 - neg.strength * 0.5;
      }

      return this.clampConfidence(confidence);
    }

    // Weighted average of supporting nodes
    let totalWeight = 0;
    let weightedSum = 0;

    for (const edge of supportEdges) {
      const supporterNode = dag.nodes.find((n) => n.id === edge.from);
      if (!supporterNode) continue;

      const supporterConfidence = supporterNode.confidence;
      const weight = edge.strength;

      weightedSum += supporterConfidence * weight;
      totalWeight += weight;
    }

    let confidence = totalWeight > 0 ? weightedSum / totalWeight : node.confidence;

    // Apply contradiction discount
    for (const neg of negativeEdges) {
      confidence *= 1 - neg.strength * 0.5;
    }

    return this.clampConfidence(confidence);
  }

  // -------------------------------------------------------------------------
  // Uncertainties
  // -------------------------------------------------------------------------

  /**
   * Get all uncertainty nodes — nodes with confidence below the threshold
   * or explicitly typed as 'uncertainty'.
   */
  getUncertainties(dagId: string): ReasoningNode[] {
    const dag = this.requireDAG(dagId);

    return dag.nodes.filter(
      (node) =>
        node.type === 'uncertainty' ||
        node.confidence < UNCERTAINTY_CONFIDENCE_THRESHOLD,
    );
  }

  // -------------------------------------------------------------------------
  // Human-Readable Formatting
  // -------------------------------------------------------------------------

  /**
   * Format the DAG as a human-readable markdown explanation.
   *
   * Structure:
   * - Conclusion and confidence
   * - Key observations and evidence
   * - Reasoning chain (inferences)
   * - Assumptions made
   * - Uncertainties and contradictions
   */
  formatExplanation(dagId: string): string {
    const dag = this.requireDAG(dagId);
    const sections: string[] = [];

    // Header
    sections.push(`## Reasoning Explanation`);
    sections.push(`**Agent:** ${dag.agentId} | **Task:** ${dag.taskId}`);
    sections.push(`**Overall Confidence:** ${(dag.overallConfidence * 100).toFixed(1)}%`);
    sections.push('');

    // Conclusion
    if (dag.conclusion) {
      sections.push(`### Conclusion`);
      sections.push(
        `${dag.conclusion.content} *(confidence: ${(dag.conclusion.confidence * 100).toFixed(1)}%)*`,
      );
      sections.push('');
    }

    // Observations
    const observations = dag.nodes.filter((n) => n.type === 'observation');
    if (observations.length > 0) {
      sections.push(`### Observations`);
      for (const obs of observations) {
        const sourceInfo = obs.source ? ` *(source: ${obs.source})*` : '';
        sections.push(`- ${obs.content}${sourceInfo}`);
      }
      sections.push('');
    }

    // Evidence
    const evidence = dag.nodes.filter((n) => n.type === 'evidence');
    if (evidence.length > 0) {
      sections.push(`### Evidence`);
      for (const ev of evidence) {
        const sourceInfo = ev.source ? ` *(source: ${ev.source})*` : '';
        sections.push(
          `- ${ev.content}${sourceInfo} *(confidence: ${(ev.confidence * 100).toFixed(1)}%)*`,
        );
      }
      sections.push('');
    }

    // Inferences (reasoning chain)
    const inferences = dag.nodes.filter((n) => n.type === 'inference');
    if (inferences.length > 0) {
      sections.push(`### Reasoning Chain`);
      for (const inf of inferences) {
        const supporters = this.getSupporters(dag, inf.id);
        const supportText =
          supporters.length > 0
            ? ` (based on: ${supporters.map((s) => this.truncate(s.content, 50)).join('; ')})`
            : '';
        sections.push(
          `- ${inf.content}${supportText} *(confidence: ${(inf.confidence * 100).toFixed(1)}%)*`,
        );
      }
      sections.push('');
    }

    // Assumptions
    const assumptions = dag.nodes.filter((n) => n.type === 'assumption');
    if (assumptions.length > 0) {
      sections.push(`### Assumptions`);
      for (const assumption of assumptions) {
        sections.push(
          `- ${assumption.content} *(confidence: ${(assumption.confidence * 100).toFixed(1)}%)*`,
        );
      }
      sections.push('');
    }

    // Uncertainties
    const uncertainties = this.getUncertainties(dagId);
    if (uncertainties.length > 0) {
      sections.push(`### Uncertainties`);
      for (const unc of uncertainties) {
        sections.push(
          `- ${unc.content} *(confidence: ${(unc.confidence * 100).toFixed(1)}%)*`,
        );
      }
      sections.push('');
    }

    // Contradictions
    const contradictions = dag.edges.filter(
      (e) => e.relationship === 'contradicts',
    );
    if (contradictions.length > 0) {
      sections.push(`### Contradictions`);
      for (const edge of contradictions) {
        const nodeA = dag.nodes.find((n) => n.id === edge.from);
        const nodeB = dag.nodes.find((n) => n.id === edge.to);
        if (nodeA && nodeB) {
          sections.push(
            `- "${this.truncate(nodeA.content, 60)}" contradicts "${this.truncate(nodeB.content, 60)}"`,
          );
        }
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  /**
   * Return a serializable copy of the DAG.
   */
  toJSON(dagId: string): ExplanationDAG {
    const dag = this.requireDAG(dagId);

    return {
      ...dag,
      nodes: dag.nodes.map((n) => ({ ...n })),
      edges: dag.edges.map((e) => ({ ...e })),
      conclusion: dag.conclusion ? { ...dag.conclusion } : undefined,
      uncertainties: dag.uncertainties.map((n) => ({ ...n })),
    };
  }

  /**
   * List all active DAGs (useful for debugging / admin views).
   */
  listDAGs(): Array<{ id: string; agentId: string; taskId: string; nodeCount: number }> {
    return Array.from(this.dags.values()).map((dag) => ({
      id: dag.id,
      agentId: dag.agentId,
      taskId: dag.taskId,
      nodeCount: dag.nodes.length,
    }));
  }

  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  /**
   * Add a node to a DAG.
   */
  private addNode(dagId: string, node: ReasoningNode): void {
    const dag = this.requireDAG(dagId);
    dag.nodes.push(node);

    // Refresh uncertainties
    dag.uncertainties = this.getUncertainties(dagId);
  }

  /**
   * Add an edge to a DAG.
   */
  private addEdge(dagId: string, edge: ReasoningEdge): void {
    const dag = this.requireDAG(dagId);
    dag.edges.push(edge);
  }

  /**
   * Get the DAG or throw if not found.
   */
  private requireDAG(dagId: string): ExplanationDAG {
    const dag = this.dags.get(dagId);
    if (!dag) {
      const error = `Explanation DAG not found: ${dagId}`;
      logger.error(error);
      throw new Error(error);
    }
    return dag;
  }

  /**
   * Get all supporting nodes for a given node.
   */
  private getSupporters(dag: ExplanationDAG, nodeId: string): ReasoningNode[] {
    const supportEdges = dag.edges.filter(
      (e) => e.to === nodeId && e.relationship === 'supports',
    );

    return supportEdges
      .map((e) => dag.nodes.find((n) => n.id === e.from))
      .filter((n): n is ReasoningNode => n !== undefined);
  }

  /**
   * Truncate a string to a maximum length with ellipsis.
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 3) + '...';
  }

  /**
   * Clamp a confidence value to [0, 1].
   */
  private clampConfidence(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}
