import { logger } from '@uaip/utils';
import { ParsedConversation, ParsedMessage } from './chat-parser.service.js';
import { ContentClassifier } from './content-classifier.service.js';
import { EmbeddingService } from './embedding.service.js';
import { v4 as uuidv4 } from 'uuid';

export interface WorkflowStep {
  id: string;
  order: number;
  action: string;
  description: string;
  inputs: string[];
  outputs: string[];
  conditions?: string[];
  duration?: string;
  responsible?: string;
  tools?: string[];
  dependencies?: string[];
  verification?: string;
  alternatives?: string[];
  errorHandling?: string[];
}

export interface ExtractedWorkflow {
  id: string;
  name: string;
  description: string;
  category: 'technical' | 'business' | 'creative' | 'administrative' | 'educational' | 'personal';
  steps: WorkflowStep[];
  prerequisites: string[];
  outcomes: string[];
  estimatedDuration: string;
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  confidence: number;
  tags: string[];
  participants: string[];
  resources: string[];
  metadata: {
    extractedFrom: 'conversation' | 'knowledge';
    sourceId: string;
    extractedAt: Date;
    method: string;
    validationStatus: 'pending' | 'validated' | 'rejected';
    qualityScore: number;
    completeness: number;
    executability: number;
  };
}

export interface ActionSequence {
  id: string;
  actions: string[];
  confidence: number;
  source: string;
  context: string;
  participants: string[];
  timeframe?: {
    start?: Date;
    end?: Date;
    duration?: string;
  };
}

export interface ExecutableWorkflow {
  id: string;
  baseWorkflow: ExtractedWorkflow;
  executionPlan: {
    steps: ExecutableStep[];
    checkpoints: Checkpoint[];
    rollbackPlan: RollbackStep[];
    monitoring: MonitoringPoint[];
  };
  validation: {
    prerequisites: ValidationRule[];
    stepValidation: ValidationRule[];
    outputValidation: ValidationRule[];
  };
  automation: {
    automatable: boolean;
    automationLevel: 'none' | 'partial' | 'full';
    manualSteps: string[];
    toolIntegrations: ToolIntegration[];
  };
}

export interface ExecutableStep extends WorkflowStep {
  executionMethod: 'manual' | 'automated' | 'semi-automated';
  validationCriteria: string[];
  successMetrics: string[];
  failureHandling: string[];
  estimatedTime: number; // in minutes
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export interface Checkpoint {
  id: string;
  afterStep: string;
  validationCriteria: string[];
  decisionPoints: string[];
  possibleOutcomes: string[];
}

export interface RollbackStep {
  stepId: string;
  rollbackActions: string[];
  conditions: string[];
  impact: 'low' | 'medium' | 'high';
}

export interface MonitoringPoint {
  stepId: string;
  metrics: string[];
  alerts: AlertCondition[];
  reportingFrequency: string;
}

export interface AlertCondition {
  condition: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  action: string;
}

export interface ValidationRule {
  rule: string;
  type: 'prerequisite' | 'input' | 'output' | 'process';
  severity: 'error' | 'warning' | 'info';
  validationMethod: 'manual' | 'automated';
}

export interface ToolIntegration {
  tool: string;
  purpose: string;
  steps: string[];
  configuration: Record<string, any>;
  apiEndpoints?: string[];
}

export interface WorkflowExtractionOptions {
  minSteps?: number;
  minConfidence?: number;
  includeIncompleteWorkflows?: boolean;
  categorizeByDomain?: boolean;
  extractExecutionDetails?: boolean;
  validateExecutability?: boolean;
  generateAutomationPlan?: boolean;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  completeness: number;
  executability: number;
  clarity: number;
  issues: string[];
  suggestions: string[];
  missingElements: string[];
}

export interface WorkflowExtractionMetrics {
  totalConversations: number;
  workflowsExtracted: number;
  averageSteps: number;
  averageConfidence: number;
  categoryCounts: Record<string, number>;
  complexityDistribution: Record<string, number>;
  executabilityScore: number;
  processingTime: number;
}

export class WorkflowExtractorService {
  private readonly workflowPatterns = [
    // Sequential patterns
    /(?:first|step\s*1|initially|to\s+start|begin\s+by)\s+(.+)/gi,
    /(?:then|next|step\s*\d+|after\s+that|following\s+that)\s+(.+)/gi,
    /(?:finally|lastly|last\s+step|to\s+complete|to\s+finish)\s+(.+)/gi,

    // Process patterns
    /(?:process|procedure|workflow|method)\s+(?:for|to|of)\s+(.+)/gi,
    /(?:how\s+to|in\s+order\s+to|to\s+accomplish)\s+(.+)/gi,

    // Action patterns
    /(?:you\s+(?:should|need\s+to|must|have\s+to)|we\s+(?:should|need\s+to|must))\s+(.+)/gi,
    /(?:make\s+sure|ensure\s+that|verify\s+that|check\s+that)\s+(.+)/gi,

    // Conditional patterns
    /(?:if|when|once|after|before)\s+(.+?),?\s+(?:then|you\s+can|you\s+should)\s+(.+)/gi,
  ];

  private readonly actionVerbs = new Set([
    'create',
    'build',
    'setup',
    'configure',
    'install',
    'deploy',
    'test',
    'verify',
    'check',
    'review',
    'analyze',
    'prepare',
    'gather',
    'collect',
    'organize',
    'arrange',
    'schedule',
    'contact',
    'communicate',
    'send',
    'receive',
    'process',
    'execute',
    'run',
    'start',
    'stop',
    'pause',
    'resume',
    'complete',
    'finish',
    'submit',
    'approve',
    'reject',
    'update',
    'modify',
    'change',
    'edit',
    'delete',
    'remove',
    'add',
    'include',
    'exclude',
  ]);

  private readonly sequenceIndicators = new Set([
    'first',
    'second',
    'third',
    'initially',
    'then',
    'next',
    'after',
    'before',
    'during',
    'while',
    'once',
    'when',
    'finally',
    'lastly',
    'step',
    'phase',
    'stage',
  ]);

  private extractionCache = new Map<string, ExtractedWorkflow[]>();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_RETRIES = 3;
  private readonly MIN_WORKFLOW_STEPS = 2;

  constructor(
    private readonly contentClassifier: ContentClassifier,
    private readonly embeddingService: EmbeddingService
  ) {}

  /**
   * Extract workflows from conversations with comprehensive analysis
   */
  async extractWorkflows(
    conversations: ParsedConversation[],
    options: WorkflowExtractionOptions = {}
  ): Promise<ExtractedWorkflow[]> {
    const startTime = Date.now();

    try {
      logger.info('Starting workflow extraction', {
        conversationCount: conversations.length,
        options,
      });

      const workflows: ExtractedWorkflow[] = [];

      for (const conversation of conversations) {
        try {
          const conversationWorkflows = await this.extractFromConversation(conversation, options);
          workflows.push(...conversationWorkflows);
        } catch (error) {
          logger.warn('Failed to extract workflows from conversation', {
            conversationId: conversation.id,
            error: error.message,
          });
        }
      }

      // Post-process workflows
      let processedWorkflows = workflows;

      // Filter by confidence threshold
      if (options.minConfidence) {
        processedWorkflows = processedWorkflows.filter(
          (w) => w.confidence >= options.minConfidence!
        );
      }

      // Filter by minimum steps
      const minSteps = options.minSteps || this.MIN_WORKFLOW_STEPS;
      processedWorkflows = processedWorkflows.filter((w) => w.steps.length >= minSteps);

      // Validate and enhance workflows
      if (options.validateExecutability) {
        processedWorkflows = await this.validateAndEnhanceWorkflows(processedWorkflows);
      }

      // Generate automation plans if requested
      if (options.generateAutomationPlan) {
        processedWorkflows = await this.generateAutomationPlans(processedWorkflows);
      }

      const processingTime = Date.now() - startTime;

      logger.info('Workflow extraction completed', {
        extracted: processedWorkflows.length,
        processingTime,
        averageSteps: this.calculateAverageSteps(processedWorkflows),
        averageConfidence: this.calculateAverageConfidence(processedWorkflows),
      });

      return processedWorkflows;
    } catch (error) {
      logger.error('Workflow extraction failed', { error: error.message });
      throw new Error(`Workflow extraction failed: ${error.message}`);
    }
  }

  /**
   * Identify action sequences in conversations
   */
  async identifyActionSequences(messages: ParsedMessage[]): Promise<ActionSequence[]> {
    const sequences: ActionSequence[] = [];
    let currentSequence: string[] = [];
    let sequenceStart = 0;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const actions = this.extractActionsFromMessage(message);

      if (actions.length > 0) {
        if (currentSequence.length === 0) {
          sequenceStart = i;
        }
        currentSequence.push(...actions);
      } else {
        // End of sequence
        if (currentSequence.length >= this.MIN_WORKFLOW_STEPS) {
          const sequence = this.createActionSequence(
            currentSequence,
            messages.slice(sequenceStart, i),
            sequenceStart
          );
          sequences.push(sequence);
        }
        currentSequence = [];
      }
    }

    // Handle final sequence
    if (currentSequence.length >= this.MIN_WORKFLOW_STEPS) {
      const sequence = this.createActionSequence(
        currentSequence,
        messages.slice(sequenceStart),
        sequenceStart
      );
      sequences.push(sequence);
    }

    return sequences;
  }

  /**
   * Build executable workflows from sequences
   */
  async buildExecutableWorkflows(sequences: ActionSequence[]): Promise<ExecutableWorkflow[]> {
    const executableWorkflows: ExecutableWorkflow[] = [];

    for (const sequence of sequences) {
      try {
        const workflow = await this.createBaseWorkflow(sequence);
        const executable = await this.enhanceWithExecutionDetails(workflow);
        executableWorkflows.push(executable);
      } catch (error) {
        logger.warn('Failed to build executable workflow from sequence', {
          sequenceId: sequence.id,
          error: error.message,
        });
      }
    }

    return executableWorkflows;
  }

  /**
   * Validate workflow completeness and executability
   */
  async validateWorkflows(workflows: ExtractedWorkflow[]): Promise<WorkflowValidationResult[]> {
    const results: WorkflowValidationResult[] = [];

    for (const workflow of workflows) {
      const result = await this.validateSingleWorkflow(workflow);
      results.push(result);
    }

    return results;
  }

  /**
   * Get workflow extraction metrics and analytics
   */
  async getExtractionMetrics(
    conversations: ParsedConversation[],
    workflows: ExtractedWorkflow[]
  ): Promise<WorkflowExtractionMetrics> {
    const categoryCounts: Record<string, number> = {};
    const complexityDistribution: Record<string, number> = {
      simple: 0,
      moderate: 0,
      complex: 0,
      expert: 0,
    };

    let totalSteps = 0;
    let totalConfidence = 0;
    let totalExecutability = 0;

    for (const workflow of workflows) {
      // Count categories
      categoryCounts[workflow.category] = (categoryCounts[workflow.category] || 0) + 1;

      // Count complexity
      complexityDistribution[workflow.complexity]++;

      // Aggregate metrics
      totalSteps += workflow.steps.length;
      totalConfidence += workflow.confidence;
      totalExecutability += workflow.metadata.executability;
    }

    return {
      totalConversations: conversations.length,
      workflowsExtracted: workflows.length,
      averageSteps: workflows.length > 0 ? totalSteps / workflows.length : 0,
      averageConfidence: workflows.length > 0 ? totalConfidence / workflows.length : 0,
      categoryCounts,
      complexityDistribution,
      executabilityScore: workflows.length > 0 ? totalExecutability / workflows.length : 0,
      processingTime: 0, // This would be set by the caller
    };
  }

  /**
   * Extract workflows from a single conversation
   */
  private async extractFromConversation(
    conversation: ParsedConversation,
    options: WorkflowExtractionOptions
  ): Promise<ExtractedWorkflow[]> {
    const workflows: ExtractedWorkflow[] = [];

    // Check cache first
    const cacheKey = this.generateCacheKey(conversation.id, options);
    if (this.extractionCache.has(cacheKey)) {
      return this.extractionCache.get(cacheKey)!;
    }

    // Extract action sequences
    const sequences = await this.identifyActionSequences(conversation.messages);

    // Convert sequences to workflows
    for (const sequence of sequences) {
      if (sequence.actions.length >= (options.minSteps || this.MIN_WORKFLOW_STEPS)) {
        const workflow = await this.createWorkflowFromSequence(sequence, conversation);

        if (workflow && (!options.minConfidence || workflow.confidence >= options.minConfidence)) {
          workflows.push(workflow);
        }
      }
    }

    // Extract procedural workflows using pattern matching
    const proceduralWorkflows = await this.extractProceduralWorkflows(conversation, options);
    workflows.push(...proceduralWorkflows);

    // Extract decision-based workflows
    const decisionWorkflows = await this.extractDecisionWorkflows(conversation, options);
    workflows.push(...decisionWorkflows);

    // Cache results
    this.extractionCache.set(cacheKey, workflows);
    setTimeout(() => this.extractionCache.delete(cacheKey), this.CACHE_TTL);

    return workflows;
  }

  /**
   * Extract actions from a single message
   */
  private extractActionsFromMessage(message: ParsedMessage): string[] {
    const actions: string[] = [];
    const content = message.content.toLowerCase();

    // Look for action verbs
    const words = content.split(/\W+/);
    for (const word of words) {
      if (this.actionVerbs.has(word)) {
        // Extract the full action context
        const actionContext = this.extractActionContext(content, word);
        if (actionContext) {
          actions.push(actionContext);
        }
      }
    }

    // Look for sequence indicators
    for (const indicator of this.sequenceIndicators) {
      const pattern = new RegExp(`\\b${indicator}[,:]?\\s+(.+?)(?:[.!?]|$)`, 'gi');
      const matches = content.match(pattern);
      if (matches) {
        actions.push(...matches.map((m) => m.trim()));
      }
    }

    // Look for imperative sentences
    const imperativePattern = /^(?:you\s+(?:should|need\s+to|must)|please|make\s+sure)\s+(.+)/gi;
    const imperativeMatches = content.match(imperativePattern);
    if (imperativeMatches) {
      actions.push(...imperativeMatches);
    }

    return [...new Set(actions)]; // Remove duplicates
  }

  /**
   * Extract action context around a verb
   */
  private extractActionContext(content: string, verb: string): string | null {
    const verbIndex = content.indexOf(verb);
    if (verbIndex === -1) return null;

    // Look for sentence boundaries
    const before = content.lastIndexOf('.', verbIndex);
    const after = content.indexOf('.', verbIndex);

    const start = before === -1 ? 0 : before + 1;
    const end = after === -1 ? content.length : after;

    const context = content.slice(start, end).trim();
    return context.length > verb.length + 5 ? context : null;
  }

  /**
   * Create action sequence object
   */
  private createActionSequence(
    actions: string[],
    messages: ParsedMessage[],
    startIndex: number
  ): ActionSequence {
    const participants = [...new Set(messages.map((m) => m.sender))];
    const context = this.extractSequenceContext(messages);

    return {
      id: uuidv4(),
      actions,
      confidence: this.calculateSequenceConfidence(actions, messages),
      source: messages[0]?.id || 'unknown',
      context,
      participants,
      timeframe: this.extractTimeframe(messages),
    };
  }

  /**
   * Extract procedural workflows using pattern matching
   */
  private async extractProceduralWorkflows(
    conversation: ParsedConversation,
    options: WorkflowExtractionOptions
  ): Promise<ExtractedWorkflow[]> {
    const workflows: ExtractedWorkflow[] = [];
    const content = conversation.messages.map((m) => m.content).join(' ');

    for (const pattern of this.workflowPatterns) {
      let match;
      const steps: string[] = [];

      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[1].trim().length > 10) {
          steps.push(match[1].trim());
        }
      }

      if (steps.length >= (options.minSteps || this.MIN_WORKFLOW_STEPS)) {
        const workflow = await this.createWorkflowFromSteps(steps, conversation, 'procedural');
        if (workflow) {
          workflows.push(workflow);
        }
      }
    }

    return workflows;
  }

  /**
   * Extract decision-based workflows
   */
  private async extractDecisionWorkflows(
    conversation: ParsedConversation,
    options: WorkflowExtractionOptions
  ): Promise<ExtractedWorkflow[]> {
    const workflows: ExtractedWorkflow[] = [];
    const decisionPatterns = [
      /if\s+(.+?),?\s+then\s+(.+?)(?:[.!?]|$)/gi,
      /when\s+(.+?),?\s+(?:you\s+should|do|perform)\s+(.+?)(?:[.!?]|$)/gi,
      /in\s+case\s+(?:of\s+)?(.+?),?\s+(.+?)(?:[.!?]|$)/gi,
    ];

    const content = conversation.messages.map((m) => m.content).join(' ');
    const decisionSteps: Array<{ condition: string; action: string }> = [];

    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[2]) {
          decisionSteps.push({
            condition: match[1].trim(),
            action: match[2].trim(),
          });
        }
      }
    }

    if (decisionSteps.length >= (options.minSteps || this.MIN_WORKFLOW_STEPS)) {
      const workflow = await this.createDecisionWorkflow(decisionSteps, conversation);
      if (workflow) {
        workflows.push(workflow);
      }
    }

    return workflows;
  }

  /**
   * Create workflow from action sequence
   */
  private async createWorkflowFromSequence(
    sequence: ActionSequence,
    conversation: ParsedConversation
  ): Promise<ExtractedWorkflow | null> {
    try {
      const steps: WorkflowStep[] = sequence.actions.map((action, index) => ({
        id: uuidv4(),
        order: index + 1,
        action: this.extractActionVerb(action),
        description: action,
        inputs: this.extractInputs(action),
        outputs: this.extractOutputs(action),
        conditions: this.extractConditions(action),
        tools: this.extractTools(action),
        verification: this.extractVerification(action),
      }));

      const category = await this.classifyWorkflowCategory(sequence.actions.join(' '));
      const complexity = this.assessComplexity(steps);

      return {
        id: uuidv4(),
        name: this.generateWorkflowName(sequence.actions),
        description: this.generateWorkflowDescription(sequence.actions),
        category,
        steps,
        prerequisites: this.extractPrerequisites(sequence.context),
        outcomes: this.extractOutcomes(sequence.actions),
        estimatedDuration: this.estimateDuration(steps),
        complexity,
        confidence: sequence.confidence,
        tags: this.extractWorkflowTags(sequence.actions.join(' ')),
        participants: sequence.participants,
        resources: this.extractResources(sequence.actions.join(' ')),
        metadata: {
          extractedFrom: 'conversation',
          sourceId: conversation.id,
          extractedAt: new Date(),
          method: 'sequence_analysis',
          validationStatus: 'pending',
          qualityScore: this.calculateQualityScore(steps),
          completeness: this.calculateCompleteness(steps),
          executability: this.calculateExecutability(steps),
        },
      };
    } catch (error) {
      logger.warn('Failed to create workflow from sequence', { error: error.message });
      return null;
    }
  }

  /**
   * Create workflow from explicit steps
   */
  private async createWorkflowFromSteps(
    stepTexts: string[],
    conversation: ParsedConversation,
    method: string
  ): Promise<ExtractedWorkflow | null> {
    try {
      const steps: WorkflowStep[] = stepTexts.map((text, index) => ({
        id: uuidv4(),
        order: index + 1,
        action: this.extractActionVerb(text),
        description: text,
        inputs: this.extractInputs(text),
        outputs: this.extractOutputs(text),
        conditions: this.extractConditions(text),
        tools: this.extractTools(text),
        verification: this.extractVerification(text),
      }));

      const category = await this.classifyWorkflowCategory(stepTexts.join(' '));
      const complexity = this.assessComplexity(steps);

      return {
        id: uuidv4(),
        name: this.generateWorkflowName(stepTexts),
        description: this.generateWorkflowDescription(stepTexts),
        category,
        steps,
        prerequisites: this.extractPrerequisites(stepTexts.join(' ')),
        outcomes: this.extractOutcomes(stepTexts),
        estimatedDuration: this.estimateDuration(steps),
        complexity,
        confidence: this.calculateStepsConfidence(stepTexts),
        tags: this.extractWorkflowTags(stepTexts.join(' ')),
        participants: [...new Set(conversation.participants)],
        resources: this.extractResources(stepTexts.join(' ')),
        metadata: {
          extractedFrom: 'conversation',
          sourceId: conversation.id,
          extractedAt: new Date(),
          method,
          validationStatus: 'pending',
          qualityScore: this.calculateQualityScore(steps),
          completeness: this.calculateCompleteness(steps),
          executability: this.calculateExecutability(steps),
        },
      };
    } catch (error) {
      logger.warn('Failed to create workflow from steps', { error: error.message });
      return null;
    }
  }

  /**
   * Create decision-based workflow
   */
  private async createDecisionWorkflow(
    decisionSteps: Array<{ condition: string; action: string }>,
    conversation: ParsedConversation
  ): Promise<ExtractedWorkflow | null> {
    try {
      const steps: WorkflowStep[] = decisionSteps.map((decision, index) => ({
        id: uuidv4(),
        order: index + 1,
        action: this.extractActionVerb(decision.action),
        description: decision.action,
        inputs: this.extractInputs(decision.action),
        outputs: this.extractOutputs(decision.action),
        conditions: [decision.condition],
        tools: this.extractTools(decision.action),
        verification: this.extractVerification(decision.action),
      }));

      const allText = decisionSteps.map((d) => `${d.condition} ${d.action}`).join(' ');
      const category = await this.classifyWorkflowCategory(allText);
      const complexity = this.assessComplexity(steps);

      return {
        id: uuidv4(),
        name: this.generateWorkflowName(decisionSteps.map((d) => d.action)),
        description: 'Decision-based workflow with conditional steps',
        category,
        steps,
        prerequisites: this.extractPrerequisites(allText),
        outcomes: this.extractOutcomes(decisionSteps.map((d) => d.action)),
        estimatedDuration: this.estimateDuration(steps),
        complexity,
        confidence: 0.75, // Decision workflows have moderate confidence
        tags: this.extractWorkflowTags(allText),
        participants: [...new Set(conversation.participants)],
        resources: this.extractResources(allText),
        metadata: {
          extractedFrom: 'conversation',
          sourceId: conversation.id,
          extractedAt: new Date(),
          method: 'decision_analysis',
          validationStatus: 'pending',
          qualityScore: this.calculateQualityScore(steps),
          completeness: this.calculateCompleteness(steps),
          executability: this.calculateExecutability(steps),
        },
      };
    } catch (error) {
      logger.warn('Failed to create decision workflow', { error: error.message });
      return null;
    }
  }

  /**
   * Validate and enhance workflows
   */
  private async validateAndEnhanceWorkflows(
    workflows: ExtractedWorkflow[]
  ): Promise<ExtractedWorkflow[]> {
    const enhanced: ExtractedWorkflow[] = [];

    for (const workflow of workflows) {
      const validation = await this.validateSingleWorkflow(workflow);

      if (validation.isValid || validation.completeness >= 0.6) {
        // Update metadata with validation results
        workflow.metadata.completeness = validation.completeness;
        workflow.metadata.executability = validation.executability;
        workflow.metadata.qualityScore =
          (validation.completeness + validation.executability + validation.clarity) / 3;
        workflow.metadata.validationStatus = validation.isValid ? 'validated' : 'pending';

        enhanced.push(workflow);
      }
    }

    return enhanced;
  }

  /**
   * Generate automation plans for workflows
   */
  private async generateAutomationPlans(
    workflows: ExtractedWorkflow[]
  ): Promise<ExtractedWorkflow[]> {
    // This would implement automation analysis
    // For now, just return the workflows unchanged
    return workflows;
  }

  /**
   * Validate a single workflow
   */
  private async validateSingleWorkflow(
    workflow: ExtractedWorkflow
  ): Promise<WorkflowValidationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    const missingElements: string[] = [];

    // Check completeness
    let completeness = 0.5; // Base score

    if (workflow.steps.length >= 3) completeness += 0.2;
    if (workflow.prerequisites.length > 0) completeness += 0.1;
    if (workflow.outcomes.length > 0) completeness += 0.1;
    if (workflow.estimatedDuration) completeness += 0.1;

    // Check executability
    let executability = 0.5; // Base score

    const stepsWithActions = workflow.steps.filter((s) => s.action && s.action.length > 0);
    executability += (stepsWithActions.length / workflow.steps.length) * 0.3;

    const stepsWithInputs = workflow.steps.filter((s) => s.inputs && s.inputs.length > 0);
    executability += (stepsWithInputs.length / workflow.steps.length) * 0.1;

    const stepsWithOutputs = workflow.steps.filter((s) => s.outputs && s.outputs.length > 0);
    executability += (stepsWithOutputs.length / workflow.steps.length) * 0.1;

    // Check clarity
    let clarity = 0.6; // Base score

    if (workflow.description && workflow.description.length > 20) clarity += 0.2;
    if (workflow.name && workflow.name.length > 5) clarity += 0.1;

    const avgStepDescLength =
      workflow.steps.reduce((sum, s) => sum + s.description.length, 0) / workflow.steps.length;
    if (avgStepDescLength > 15) clarity += 0.1;

    // Identify issues
    if (workflow.steps.length < 2) {
      issues.push('Workflow has too few steps');
      missingElements.push('Additional workflow steps');
    }

    if (!workflow.description || workflow.description.length < 10) {
      issues.push('Workflow description is too brief');
      suggestions.push('Add a more detailed workflow description');
    }

    if (workflow.prerequisites.length === 0) {
      suggestions.push('Consider adding prerequisites for this workflow');
    }

    if (workflow.outcomes.length === 0) {
      suggestions.push('Define expected outcomes for this workflow');
    }

    return {
      isValid: issues.length === 0 && completeness >= 0.7 && executability >= 0.6,
      completeness: Math.min(1, completeness),
      executability: Math.min(1, executability),
      clarity: Math.min(1, clarity),
      issues,
      suggestions,
      missingElements,
    };
  }

  // Helper methods for workflow analysis
  private async classifyWorkflowCategory(content: string): Promise<ExtractedWorkflow['category']> {
    const technicalKeywords = ['code', 'deploy', 'configure', 'install', 'debug', 'test', 'build'];
    const businessKeywords = ['process', 'approve', 'review', 'meeting', 'strategy', 'plan'];
    const creativeKeywords = ['design', 'create', 'brainstorm', 'ideate', 'prototype'];

    const lowerContent = content.toLowerCase();

    if (technicalKeywords.some((kw) => lowerContent.includes(kw))) return 'technical';
    if (businessKeywords.some((kw) => lowerContent.includes(kw))) return 'business';
    if (creativeKeywords.some((kw) => lowerContent.includes(kw))) return 'creative';

    return 'administrative';
  }

  private assessComplexity(steps: WorkflowStep[]): ExtractedWorkflow['complexity'] {
    const complexity = this.calculateWorkflowComplexity(steps);

    if (complexity < 0.3) return 'simple';
    if (complexity < 0.6) return 'moderate';
    if (complexity < 0.8) return 'complex';
    return 'expert';
  }

  private calculateWorkflowComplexity(steps: WorkflowStep[]): number {
    let complexity = 0;

    // Base complexity from number of steps
    complexity += Math.min(0.4, steps.length / 10);

    // Complexity from conditions
    const conditionalSteps = steps.filter((s) => s.conditions && s.conditions.length > 0);
    complexity += (conditionalSteps.length / steps.length) * 0.3;

    // Complexity from dependencies
    const dependentSteps = steps.filter((s) => s.dependencies && s.dependencies.length > 0);
    complexity += (dependentSteps.length / steps.length) * 0.2;

    // Complexity from tools
    const toolSteps = steps.filter((s) => s.tools && s.tools.length > 0);
    complexity += (toolSteps.length / steps.length) * 0.1;

    return Math.min(1, complexity);
  }

  private extractActionVerb(text: string): string {
    const words = text.toLowerCase().split(/\W+/);
    for (const word of words) {
      if (this.actionVerbs.has(word)) {
        return word;
      }
    }
    return 'perform';
  }

  private extractInputs(text: string): string[] {
    const inputPatterns = [
      /(?:using|with|from|given)\s+(.+?)(?:\s+(?:to|for|and)|[,.;]|$)/gi,
      /(?:input|inputs|requires?|needs?)\s*:?\s*(.+?)(?:[,.;]|$)/gi,
    ];

    const inputs: string[] = [];
    for (const pattern of inputPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        inputs.push(...matches.map((m) => m.trim()));
      }
    }

    return [...new Set(inputs)];
  }

  private extractOutputs(text: string): string[] {
    const outputPatterns = [
      /(?:produces?|creates?|generates?|results?\s+in)\s+(.+?)(?:\s+(?:that|which|and)|[,.;]|$)/gi,
      /(?:output|outputs|deliverables?)\s*:?\s*(.+?)(?:[,.;]|$)/gi,
    ];

    const outputs: string[] = [];
    for (const pattern of outputPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        outputs.push(...matches.map((m) => m.trim()));
      }
    }

    return [...new Set(outputs)];
  }

  private extractConditions(text: string): string[] {
    const conditionPatterns = [
      /(?:if|when|once|after|before|unless)\s+(.+?)(?:\s*[,;]|\s+then|\s+you|$)/gi,
    ];

    const conditions: string[] = [];
    for (const pattern of conditionPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        conditions.push(...matches.map((m) => m.trim()));
      }
    }

    return [...new Set(conditions)];
  }

  private extractTools(text: string): string[] {
    const toolPatterns = [
      /(?:using|with|via)\s+([A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)?)/gi,
      /\b(?:tool|software|application|platform|system)\s*:?\s*([A-Za-z][A-Za-z0-9]*)/gi,
    ];

    const tools: string[] = [];
    for (const pattern of toolPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          tools.push(match[1].trim());
        }
      }
    }

    return [...new Set(tools)];
  }

  private extractVerification(text: string): string | undefined {
    const verificationPatterns = [
      /(?:verify|check|ensure|confirm)\s+(?:that\s+)?(.+?)(?:[,.;]|$)/gi,
      /(?:validation|verification)\s*:?\s*(.+?)(?:[,.;]|$)/gi,
    ];

    for (const pattern of verificationPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  private generateWorkflowName(actions: string[]): string {
    if (actions.length === 0) return 'Unnamed Workflow';

    const firstAction = actions[0];
    const verb = this.extractActionVerb(firstAction);
    const object = firstAction
      .replace(new RegExp(`\\b${verb}\\b`, 'i'), '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ');

    return `${verb.charAt(0).toUpperCase() + verb.slice(1)} ${object}`.trim();
  }

  private generateWorkflowDescription(actions: string[]): string {
    if (actions.length === 0) return 'No description available';

    const summary =
      actions.length > 1
        ? `${actions.length}-step workflow involving ${actions.slice(0, 2).join(', ')}${actions.length > 2 ? '...' : ''}`
        : actions[0];

    return summary;
  }

  private extractPrerequisites(text: string): string[] {
    const prerequisitePatterns = [
      /(?:prerequisites?|requirements?|before|first)\s*:?\s*(.+?)(?:[,.;]|$)/gi,
      /(?:you\s+(?:need|must|should)\s+(?:to\s+)?have|ensure\s+(?:you\s+)?have)\s+(.+?)(?:[,.;]|$)/gi,
    ];

    const prerequisites: string[] = [];
    for (const pattern of prerequisitePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        prerequisites.push(...matches.map((m) => m.trim()));
      }
    }

    return [...new Set(prerequisites)];
  }

  private extractOutcomes(actions: string[]): string[] {
    const allText = actions.join(' ');
    const outcomePatterns = [
      /(?:result|outcome|deliverable|goal|objective)\s*:?\s*(.+?)(?:[,.;]|$)/gi,
      /(?:you\s+(?:will|should)\s+(?:have|get|achieve)|this\s+(?:will|should)\s+(?:create|produce|result\s+in))\s+(.+?)(?:[,.;]|$)/gi,
    ];

    const outcomes: string[] = [];
    for (const pattern of outcomePatterns) {
      const matches = allText.match(pattern);
      if (matches) {
        outcomes.push(...matches.map((m) => m.trim()));
      }
    }

    return [...new Set(outcomes)];
  }

  private estimateDuration(steps: WorkflowStep[]): string {
    // Simple duration estimation based on step count and complexity
    const baseMinutes = steps.length * 15; // 15 minutes per step
    const complexityMultiplier =
      steps.filter((s) => s.conditions && s.conditions.length > 0).length * 0.5;

    const totalMinutes = baseMinutes * (1 + complexityMultiplier);

    if (totalMinutes < 60) return `${Math.round(totalMinutes)} minutes`;
    if (totalMinutes < 480) return `${Math.round((totalMinutes / 60) * 10) / 10} hours`;
    return `${Math.round((totalMinutes / 480) * 10) / 10} days`;
  }

  private extractWorkflowTags(text: string): string[] {
    const words = text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    const commonWords = new Set([
      'this',
      'that',
      'with',
      'from',
      'they',
      'them',
      'their',
      'have',
      'been',
      'were',
      'said',
      'each',
      'more',
      'some',
      'like',
      'into',
      'time',
      'very',
      'then',
      'than',
      'only',
      'come',
      'over',
      'just',
      'also',
      'step',
      'workflow',
      'process',
    ]);

    const keywords = words.filter((w) => !commonWords.has(w));
    return [...new Set(keywords)].slice(0, 5);
  }

  private extractResources(text: string): string[] {
    const resourcePatterns = [
      /(?:resource|material|document|file|tool|equipment)\s*:?\s*(.+?)(?:[,.;]|$)/gi,
      /(?:you\s+(?:need|require)|using|with)\s+(?:a\s+|an\s+|the\s+)?([A-Za-z][A-Za-z0-9\s]*?)(?:\s+(?:to|for|and)|[,.;]|$)/gi,
    ];

    const resources: string[] = [];
    for (const pattern of resourcePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        resources.push(...matches.map((m) => m.trim()));
      }
    }

    return [...new Set(resources)].slice(0, 10);
  }

  private calculateSequenceConfidence(actions: string[], messages: ParsedMessage[]): number {
    let confidence = 0.6; // Base confidence

    // Boost confidence for clear action verbs
    const actionCount = actions.filter((a) =>
      this.actionVerbs.has(this.extractActionVerb(a))
    ).length;
    confidence += (actionCount / actions.length) * 0.2;

    // Boost confidence for sequence indicators
    const sequenceIndicatorCount = actions.filter((a) =>
      this.sequenceIndicators.has(a.toLowerCase().split(/\W+/)[0])
    ).length;
    confidence += (sequenceIndicatorCount / actions.length) * 0.1;

    // Boost confidence for longer sequences
    if (actions.length >= 5) confidence += 0.1;

    return Math.min(1, confidence);
  }

  private calculateStepsConfidence(steps: string[]): number {
    let confidence = 0.7; // Base confidence for explicit steps

    // Boost for numbered or ordered steps
    const orderedSteps = steps.filter((s) => /^\d+[.)]\s/.test(s.trim())).length;
    confidence += (orderedSteps / steps.length) * 0.2;

    // Boost for clear action verbs
    const actionSteps = steps.filter((s) => this.actionVerbs.has(this.extractActionVerb(s))).length;
    confidence += (actionSteps / steps.length) * 0.1;

    return Math.min(1, confidence);
  }

  private calculateQualityScore(steps: WorkflowStep[]): number {
    let score = 0.5; // Base score

    // Score based on step completeness
    const completeSteps = steps.filter(
      (s) => s.action && s.description && s.description.length > 10
    ).length;
    score += (completeSteps / steps.length) * 0.3;

    // Score based on input/output definition
    const ioSteps = steps.filter(
      (s) => (s.inputs && s.inputs.length > 0) || (s.outputs && s.outputs.length > 0)
    ).length;
    score += (ioSteps / steps.length) * 0.2;

    return Math.min(1, score);
  }

  private calculateCompleteness(steps: WorkflowStep[]): number {
    let completeness = 0.4; // Base completeness

    // Check for essential elements
    const stepsWithActions = steps.filter((s) => s.action).length;
    completeness += (stepsWithActions / steps.length) * 0.3;

    const stepsWithDescriptions = steps.filter(
      (s) => s.description && s.description.length > 5
    ).length;
    completeness += (stepsWithDescriptions / steps.length) * 0.3;

    return Math.min(1, completeness);
  }

  private calculateExecutability(steps: WorkflowStep[]): number {
    let executability = 0.3; // Base executability

    // Check for actionable steps
    const actionableSteps = steps.filter(
      (s) => s.action && this.actionVerbs.has(s.action.toLowerCase())
    ).length;
    executability += (actionableSteps / steps.length) * 0.4;

    // Check for verification criteria
    const verifiableSteps = steps.filter((s) => s.verification).length;
    executability += (verifiableSteps / steps.length) * 0.3;

    return Math.min(1, executability);
  }

  private extractSequenceContext(messages: ParsedMessage[]): string {
    // Extract context from surrounding messages
    const context = messages
      .slice(0, 3)
      .map((m) => m.content)
      .join(' ');
    return context.length > 200 ? context.substring(0, 200) + '...' : context;
  }

  private extractTimeframe(messages: ParsedMessage[]): ActionSequence['timeframe'] | undefined {
    if (messages.length === 0) return undefined;

    const start = messages[0].timestamp;
    const end = messages[messages.length - 1].timestamp;
    const duration = end.getTime() - start.getTime();

    return {
      start,
      end,
      duration: this.formatDuration(duration),
    };
  }

  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private generateCacheKey(conversationId: string, options: WorkflowExtractionOptions): string {
    return `${conversationId}_${JSON.stringify(options)}`;
  }

  private calculateAverageSteps(workflows: ExtractedWorkflow[]): number {
    if (workflows.length === 0) return 0;
    return workflows.reduce((sum, w) => sum + w.steps.length, 0) / workflows.length;
  }

  private calculateAverageConfidence(workflows: ExtractedWorkflow[]): number {
    if (workflows.length === 0) return 0;
    return workflows.reduce((sum, w) => sum + w.confidence, 0) / workflows.length;
  }

  private async createBaseWorkflow(sequence: ActionSequence): Promise<ExtractedWorkflow> {
    // This would create a base workflow from sequence
    // Implementation would be similar to createWorkflowFromSequence
    throw new Error('Not implemented yet');
  }

  private async enhanceWithExecutionDetails(
    workflow: ExtractedWorkflow
  ): Promise<ExecutableWorkflow> {
    // This would enhance workflow with execution details
    // Implementation would add execution planning, validation rules, etc.
    throw new Error('Not implemented yet');
  }
}
