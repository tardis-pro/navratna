import { ProjectManagementService } from './project-management.service';
import { EventBusService } from './eventBusService';
import { DatabaseService } from './databaseService';
import { logger } from '@uaip/utils';
import { ProjectStatus, ProjectPriority } from '@uaip/types';
import { Project, ProjectTask } from './entities/Project.js';

export interface ProjectHealthCheck {
  projectId: string;
  overallHealth: 'excellent' | 'good' | 'warning' | 'critical';
  budgetHealth: 'on-track' | 'over-budget' | 'critical';
  scheduleHealth: 'on-time' | 'delayed' | 'overdue';
  taskHealth: 'progressing' | 'stalled' | 'blocked';
  agentHealth: 'active' | 'inactive' | 'overloaded';
  recommendations: string[];
  metrics: {
    budgetUtilization: number;
    completionRate: number;
    averageTaskDuration: number;
    activeAgents: number;
    blockedTasks: number;
    overdueTasksCount: number;
  };
}

export interface ProjectAlert {
  id: string;
  projectId: string;
  type: 'budget' | 'schedule' | 'task' | 'agent' | 'security';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  actionRequired?: string;
  triggeredAt: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
}

export interface ProjectAutomation {
  id: string;
  projectId: string;
  type: 'budget_threshold' | 'task_overdue' | 'agent_idle' | 'completion_trigger';
  trigger: {
    condition: string;
    threshold?: number;
    schedule?: string;
  };
  actions: Array<{
    type: 'notify' | 'reassign' | 'pause' | 'escalate' | 'archive';
    config: any;
  }>;
  isActive: boolean;
  lastExecuted?: Date;
}

export class ProjectLifecycleService {
  private alerts = new Map<string, ProjectAlert[]>();
  private automations = new Map<string, ProjectAutomation[]>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  constructor(
    private projectService: ProjectManagementService,
    private eventBusService: EventBusService,
    private databaseService: DatabaseService
  ) {}

  async initialize(): Promise<void> {
    // Set up event subscriptions
    await this.setupEventSubscriptions();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    logger.info('Project Lifecycle Service initialized');
  }

  /**
   * Perform comprehensive health check on a project
   */
  async performHealthCheck(projectId: string): Promise<ProjectHealthCheck> {
    try {
      const project = await this.projectService.getProject(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const metrics = await this.projectService.getProjectMetrics(projectId);
      
      // Calculate health scores
      const budgetHealth = this.assessBudgetHealth(project);
      const scheduleHealth = this.assessScheduleHealth(project);
      const taskHealth = this.assessTaskHealth(metrics);
      const agentHealth = this.assessAgentHealth(metrics);

      // Determine overall health
      const overallHealth = this.calculateOverallHealth(
        budgetHealth, scheduleHealth, taskHealth, agentHealth
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        project, metrics, budgetHealth, scheduleHealth, taskHealth, agentHealth
      );

      // Count problematic tasks
      const { overdueTasksCount, blockedTasks } = await this.getTaskHealthMetrics(projectId);

      const healthCheck: ProjectHealthCheck = {
        projectId,
        overallHealth,
        budgetHealth,
        scheduleHealth,
        taskHealth,
        agentHealth,
        recommendations,
        metrics: {
          budgetUtilization: project.budgetUtilization,
          completionRate: metrics.completionRate,
          averageTaskDuration: metrics.averageTaskDuration,
          activeAgents: metrics.agentPerformance.length,
          blockedTasks,
          overdueTasksCount
        }
      };

      // Check for alerts
      await this.checkForAlerts(project, healthCheck);

      return healthCheck;
    } catch (error) {
      logger.error('Failed to perform health check', { error, projectId });
      throw error;
    }
  }

  /**
   * Create an automation rule for a project
   */
  async createAutomation(automation: Omit<ProjectAutomation, 'id' | 'lastExecuted'>): Promise<ProjectAutomation> {
    const newAutomation: ProjectAutomation = {
      ...automation,
      id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      lastExecuted: undefined
    };

    const projectAutomations = this.automations.get(automation.projectId) || [];
    projectAutomations.push(newAutomation);
    this.automations.set(automation.projectId, projectAutomations);

    logger.info('Project automation created', { 
      automationId: newAutomation.id, 
      projectId: automation.projectId,
      type: automation.type
    });

    return newAutomation;
  }

  /**
   * Execute automations for a project
   */
  async executeAutomations(projectId: string): Promise<void> {
    const automations = this.automations.get(projectId) || [];
    
    for (const automation of automations.filter(a => a.isActive)) {
      try {
        const shouldExecute = await this.shouldExecuteAutomation(automation);
        
        if (shouldExecute) {
          await this.executeAutomationActions(automation);
          automation.lastExecuted = new Date();
          
          logger.info('Automation executed', {
            automationId: automation.id,
            projectId,
            type: automation.type
          });
        }
      } catch (error) {
        logger.error('Failed to execute automation', {
          error,
          automationId: automation.id,
          projectId
        });
      }
    }
  }

  /**
   * Archive completed or cancelled projects
   */
  async archiveProject(projectId: string, reason: string): Promise<void> {
    try {
      const project = await this.projectService.getProject(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Update project status
      await this.projectService.updateProject(projectId, {
        status: ProjectStatus.ARCHIVED,
        metadata: {
          ...project.metadata,
          archivedAt: new Date(),
          archiveReason: reason
        }
      });

      // Clean up automations
      this.automations.delete(projectId);
      this.alerts.delete(projectId);

      // Emit archive event
      await this.eventBusService.publish('project.archived', {
        projectId,
        reason,
        archivedAt: new Date()
      });

      logger.info('Project archived', { projectId, reason });
    } catch (error) {
      logger.error('Failed to archive project', { error, projectId, reason });
      throw error;
    }
  }

  /**
   * Get project alerts
   */
  getProjectAlerts(projectId: string): ProjectAlert[] {
    return this.alerts.get(projectId) || [];
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    for (const [projectId, alerts] of this.alerts.entries()) {
      const alert = alerts.find(a => a.id === alertId);
      if (alert) {
        alert.acknowledged = true;
        
        await this.eventBusService.publish('project.alert.acknowledged', {
          alertId,
          projectId,
          acknowledgedAt: new Date()
        });
        
        logger.info('Alert acknowledged', { alertId, projectId });
        return;
      }
    }
    
    throw new Error(`Alert ${alertId} not found`);
  }

  // Private helper methods
  private async setupEventSubscriptions(): Promise<void> {
    try {
      // Listen for project events
      await this.eventBusService.subscribe('project.created', async (event) => {
        await this.onProjectCreated(event);
      });

      await this.eventBusService.subscribe('task.updated', async (event) => {
        await this.onTaskUpdated(event);
      });

      await this.eventBusService.subscribe('tool.usage.recorded', async (event) => {
        await this.onToolUsageRecorded(event);
      });

      logger.info('Project lifecycle event subscriptions configured');
    } catch (error) {
      logger.error('Failed to setup event subscriptions', { error });
    }
  }

  private startHealthMonitoring(): void {
    // Run health checks every 15 minutes
    this.healthCheckInterval = setInterval(async () => {
      await this.runScheduledHealthChecks();
    }, 15 * 60 * 1000);

    logger.info('Health monitoring started (15-minute intervals)');
  }

  private async runScheduledHealthChecks(): Promise<void> {
    try {
      // Get all active projects
      const { projects } = await this.projectService.listProjects({
        status: ProjectStatus.ACTIVE,
        limit: 100
      });

      for (const project of projects) {
        try {
          const healthCheck = await this.performHealthCheck(project.id);
          
          // Execute automations based on health
          if (healthCheck.overallHealth === 'critical' || healthCheck.overallHealth === 'warning') {
            await this.executeAutomations(project.id);
          }
        } catch (error) {
          logger.error('Health check failed for project', {
            error,
            projectId: project.id
          });
        }
      }
    } catch (error) {
      logger.error('Scheduled health check run failed', { error });
    }
  }

  private assessBudgetHealth(project: Project): 'on-track' | 'over-budget' | 'critical' {
    if (project.budgetUtilization > 100) return 'critical';
    if (project.budgetUtilization > 85) return 'over-budget';
    return 'on-track';
  }

  private assessScheduleHealth(project: Project): 'on-time' | 'delayed' | 'overdue' {
    if (project.isOverdue) return 'overdue';
    
    // Calculate if we're behind schedule based on completion rate vs time elapsed
    if (project.endDate) {
      const totalDuration = project.endDate.getTime() - project.startDate!.getTime();
      const elapsed = Date.now() - project.startDate!.getTime();
      const expectedCompletion = (elapsed / totalDuration) * 100;
      
      if (project.completionPercentage < expectedCompletion - 20) return 'delayed';
    }
    
    return 'on-time';
  }

  private assessTaskHealth(metrics: any): 'progressing' | 'stalled' | 'blocked' {
    if (metrics.taskCompletionRate === 0) return 'blocked';
    if (metrics.taskCompletionRate < 20) return 'stalled';
    return 'progressing';
  }

  private assessAgentHealth(metrics: any): 'active' | 'inactive' | 'overloaded' {
    const activeAgents = metrics.agentPerformance.filter((agent: any) => agent.tasksCompleted > 0).length;
    const totalAgents = metrics.agentPerformance.length;
    
    if (activeAgents === 0) return 'inactive';
    if (activeAgents / totalAgents < 0.5) return 'overloaded';
    return 'active';
  }

  private calculateOverallHealth(
    budgetHealth: string,
    scheduleHealth: string, 
    taskHealth: string,
    agentHealth: string
  ): 'excellent' | 'good' | 'warning' | 'critical' {
    const criticalIssues = [budgetHealth, scheduleHealth, taskHealth, agentHealth]
      .filter(h => h.includes('critical') || h.includes('overdue') || h.includes('blocked')).length;
    
    const warningIssues = [budgetHealth, scheduleHealth, taskHealth, agentHealth]
      .filter(h => h.includes('over-budget') || h.includes('delayed') || h.includes('stalled')).length;

    if (criticalIssues > 0) return 'critical';
    if (warningIssues > 1) return 'warning';
    if (warningIssues > 0) return 'good';
    return 'excellent';
  }

  private generateRecommendations(
    project: Project,
    metrics: any,
    budgetHealth: string,
    scheduleHealth: string,
    taskHealth: string,
    agentHealth: string
  ): string[] {
    const recommendations: string[] = [];

    if (budgetHealth === 'over-budget') {
      recommendations.push('Consider reviewing tool usage costs and optimizing expensive operations');
    }
    
    if (budgetHealth === 'critical') {
      recommendations.push('URGENT: Budget exceeded. Pause non-critical tool executions immediately');
    }

    if (scheduleHealth === 'delayed') {
      recommendations.push('Project is behind schedule. Consider adding more agents or extending deadline');
    }

    if (scheduleHealth === 'overdue') {
      recommendations.push('URGENT: Project is overdue. Immediate intervention required');
    }

    if (taskHealth === 'stalled') {
      recommendations.push('Task completion is slow. Review task assignments and dependencies');
    }

    if (taskHealth === 'blocked') {
      recommendations.push('URGENT: Tasks are blocked. Investigate and resolve blocking issues');
    }

    if (agentHealth === 'inactive') {
      recommendations.push('No active agents detected. Assign agents to project tasks');
    }

    if (agentHealth === 'overloaded') {
      recommendations.push('Agents appear overloaded. Consider adding more agents or redistributing work');
    }

    // Performance-based recommendations
    if (metrics.averageTaskDuration > 3600000) { // > 1 hour
      recommendations.push('Tasks are taking longer than expected. Consider tool optimization or task breakdown');
    }

    return recommendations;
  }

  private async getTaskHealthMetrics(projectId: string): Promise<{
    overdueTasksCount: number;
    blockedTasks: number;
  }> {
    // This would be implemented with proper database queries
    return {
      overdueTasksCount: 0,
      blockedTasks: 0
    };
  }

  private async checkForAlerts(project: Project, healthCheck: ProjectHealthCheck): Promise<void> {
    const alerts: ProjectAlert[] = [];

    // Budget alerts
    if (healthCheck.budgetHealth === 'critical') {
      alerts.push(this.createAlert(project.id, 'budget', 'critical', 
        'Project budget exceeded', 'Immediate budget review required'));
    } else if (healthCheck.budgetHealth === 'over-budget') {
      alerts.push(this.createAlert(project.id, 'budget', 'warning',
        'Project approaching budget limit', 'Monitor spending closely'));
    }

    // Schedule alerts
    if (healthCheck.scheduleHealth === 'overdue') {
      alerts.push(this.createAlert(project.id, 'schedule', 'critical',
        'Project is overdue', 'Immediate action required'));
    }

    // Task alerts
    if (healthCheck.taskHealth === 'blocked') {
      alerts.push(this.createAlert(project.id, 'task', 'error',
        'Tasks are blocked', 'Investigate blocking issues'));
    }

    // Store alerts
    if (alerts.length > 0) {
      const existingAlerts = this.alerts.get(project.id) || [];
      this.alerts.set(project.id, [...existingAlerts, ...alerts]);

      // Emit alert events
      for (const alert of alerts) {
        await this.eventBusService.publish('project.alert.created', alert);
      }
    }
  }

  private createAlert(
    projectId: string,
    type: ProjectAlert['type'],
    severity: ProjectAlert['severity'],
    message: string,
    actionRequired?: string
  ): ProjectAlert {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      type,
      severity,
      message,
      actionRequired,
      triggeredAt: new Date(),
      acknowledged: false
    };
  }

  private async shouldExecuteAutomation(automation: ProjectAutomation): Promise<boolean> {
    // Implement automation condition checking
    // This would check the trigger conditions against current project state
    return false; // Simplified for now
  }

  private async executeAutomationActions(automation: ProjectAutomation): Promise<void> {
    for (const action of automation.actions) {
      try {
        switch (action.type) {
          case 'notify':
            await this.executeNotifyAction(automation.projectId, action.config);
            break;
          case 'reassign':
            await this.executeReassignAction(automation.projectId, action.config);
            break;
          case 'pause':
            await this.executePauseAction(automation.projectId, action.config);
            break;
          case 'escalate':
            await this.executeEscalateAction(automation.projectId, action.config);
            break;
          case 'archive':
            await this.archiveProject(automation.projectId, 'Automated archival');
            break;
        }
      } catch (error) {
        logger.error('Failed to execute automation action', {
          error,
          automationId: automation.id,
          actionType: action.type
        });
      }
    }
  }

  private async executeNotifyAction(projectId: string, config: any): Promise<void> {
    await this.eventBusService.publish('project.notification', {
      projectId,
      message: config.message,
      recipients: config.recipients
    });
  }

  private async executeReassignAction(projectId: string, config: any): Promise<void> {
    // Implementation for task reassignment
    logger.info('Reassign action executed', { projectId, config });
  }

  private async executePauseAction(projectId: string, config: any): Promise<void> {
    await this.projectService.updateProject(projectId, {
      status: ProjectStatus.PAUSED,
      metadata: { pausedBy: 'automation', pausedAt: new Date() }
    });
  }

  private async executeEscalateAction(projectId: string, config: any): Promise<void> {
    await this.eventBusService.publish('project.escalation', {
      projectId,
      escalationLevel: config.level,
      reason: config.reason
    });
  }

  // Event handlers
  private async onProjectCreated(event: any): Promise<void> {
    const { projectId } = event;
    
    // Set up default automations for new projects
    await this.createAutomation({
      projectId,
      type: 'budget_threshold',
      trigger: {
        condition: 'budget_utilization > threshold',
        threshold: 90
      },
      actions: [{
        type: 'notify',
        config: {
          message: 'Project approaching budget limit',
          recipients: ['project_owner']
        }
      }],
      isActive: true
    });

    logger.info('Default automations created for new project', { projectId });
  }

  private async onTaskUpdated(event: any): Promise<void> {
    const { projectId, statusChanged } = event;
    
    if (statusChanged && projectId) {
      // Trigger health check for project when task status changes
      setTimeout(() => this.performHealthCheck(projectId), 1000);
    }
  }

  private async onToolUsageRecorded(event: any): Promise<void> {
    const { projectId, cost } = event;
    
    // Check if this tool usage pushes project over budget
    if (cost > 0 && projectId) {
      const project = await this.projectService.getProject(projectId);
      if (project && project.isOverBudget) {
        await this.executeAutomations(projectId);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    logger.info('Project Lifecycle Service shut down');
  }
}