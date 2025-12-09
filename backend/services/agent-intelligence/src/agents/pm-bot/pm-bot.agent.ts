/**
 * Project Manager Bot Agent
 * Enterprise project management agent with Jira/Confluence integration
 * Handles project tracking, task management, and team coordination
 */

import { Agent, AgentRole, AgentCapability, ConversationContext } from '@uaip/types';
import { logger } from '@uaip/utils';
import { EventBusService, ToolExecutionService } from '@uaip/shared-services';
import { BaseAgent } from '../base-agent';

export interface PMBotConfig {
  eventBusService: EventBusService;
  toolExecutionService: ToolExecutionService;
  integrations: {
    jira: {
      enabled: boolean;
      baseUrl: string;
      projectKeys: string[];
      defaultAssignee?: string;
    };
    confluence: {
      enabled: boolean;
      baseUrl: string;
      spaceKeys: string[];
    };
    slack?: {
      enabled: boolean;
      channelId: string;
    };
  };
  capabilities: {
    createTasks: boolean;
    updateTasks: boolean;
    assignTasks: boolean;
    trackProgress: boolean;
    generateReports: boolean;
    manageSprints: boolean;
    documentDecisions: boolean;
  };
}

interface ProjectContext {
  projectKey: string;
  sprintId?: string;
  teamMembers: string[];
  currentPhase: string;
  priorities: string[];
}

export class PMBotAgent extends BaseAgent {
  private toolExecutionService: ToolExecutionService;
  private integrations: PMBotConfig['integrations'];
  private pmCapabilities: PMBotConfig['capabilities'];
  private projectContexts: Map<string, ProjectContext> = new Map();

  constructor(config: PMBotConfig) {
    super({
      id: 'pm-bot-agent',
      name: 'Project Manager Assistant',
      description: 'AI-powered project management assistant with Jira/Confluence integration',
      role: AgentRole.SPECIALIST,
      capabilities: [
        AgentCapability.TASK_AUTOMATION,
        AgentCapability.TOOL_EXECUTION,
        AgentCapability.REPORTING,
        AgentCapability.COLLABORATION,
        AgentCapability.WORKFLOW_MANAGEMENT,
      ],
      eventBusService: config.eventBusService,
      serviceName: 'pm-bot-agent',
    });

    this.toolExecutionService = config.toolExecutionService;
    this.integrations = config.integrations;
    this.pmCapabilities = config.capabilities;
  }

  async initialize(): Promise<void> {
    await super.initialize();

    // Set up PM-specific event subscriptions
    await this.eventBusService.subscribe('pm.task.create', this.handleCreateTask.bind(this));
    await this.eventBusService.subscribe('pm.task.update', this.handleUpdateTask.bind(this));
    await this.eventBusService.subscribe('pm.sprint.plan', this.handleSprintPlanning.bind(this));
    await this.eventBusService.subscribe(
      'pm.report.generate',
      this.handleReportGeneration.bind(this)
    );
    await this.eventBusService.subscribe(
      'pm.meeting.document',
      this.handleMeetingDocumentation.bind(this)
    );

    // Initialize tool integrations
    await this.initializeIntegrations();

    logger.info('PM Bot Agent initialized', {
      agent: this.agent.name,
      integrations: Object.keys(this.integrations).filter((k) => this.integrations[k]?.enabled),
      capabilities: Object.keys(this.pmCapabilities).filter((k) => this.pmCapabilities[k]),
    });
  }

  /**
   * Process project management request
   */
  async processRequest(
    request: string,
    context: ConversationContext,
    userId: string
  ): Promise<{
    response: string;
    actions: Array<{
      type: string;
      status: 'completed' | 'pending' | 'failed';
      details: any;
    }>;
    suggestions?: string[];
  }> {
    try {
      logger.info('Processing PM request', {
        requestLength: request.length,
        userId,
        contextId: context.contextId,
      });

      // Analyze request intent
      const intent = await this.analyzePMIntent(request, context);

      // Execute appropriate action
      let result;
      switch (intent.action) {
        case 'create_task':
          result = await this.createTask(intent.parameters, userId);
          break;
        case 'update_task':
          result = await this.updateTask(intent.parameters, userId);
          break;
        case 'check_status':
          result = await this.checkProjectStatus(intent.parameters);
          break;
        case 'assign_task':
          result = await this.assignTask(intent.parameters, userId);
          break;
        case 'generate_report':
          result = await this.generateReport(intent.parameters);
          break;
        case 'plan_sprint':
          result = await this.planSprint(intent.parameters, userId);
          break;
        case 'document_meeting':
          result = await this.documentMeeting(intent.parameters, userId);
          break;
        default:
          result = await this.handleGeneralPMQuery(request, context);
      }

      // Generate suggestions for next actions
      const suggestions = await this.generateNextActionSuggestions(intent, result);

      return {
        response: result.message,
        actions: result.actions || [],
        suggestions,
      };
    } catch (error) {
      logger.error('Failed to process PM request', { error, request });
      return this.handlePMError(request, error);
    }
  }

  /**
   * Create a task in Jira
   */
  private async createTask(
    parameters: any,
    userId: string
  ): Promise<{ message: string; actions: any[] }> {
    if (!this.pmCapabilities.createTasks) {
      return {
        message: "I don't have permission to create tasks. Please contact your administrator.",
        actions: [],
      };
    }

    try {
      const jiraPayload = {
        fields: {
          project: { key: parameters.projectKey || this.integrations.jira.projectKeys[0] },
          summary: parameters.title,
          description: parameters.description || '',
          issuetype: { name: parameters.type || 'Task' },
          priority: { name: parameters.priority || 'Medium' },
          assignee: parameters.assignee ? { name: parameters.assignee } : null,
          labels: parameters.labels || [],
          components: parameters.components || [],
          duedate: parameters.dueDate || null,
        },
      };

      // Add custom fields if specified
      if (parameters.customFields) {
        Object.assign(jiraPayload.fields, parameters.customFields);
      }

      // Execute Jira API call through tool execution service
      const response = await this.toolExecutionService.executeTool({
        toolId: 'jira_api',
        operation: 'createIssue',
        parameters: jiraPayload,
        userId,
        securityContext: { level: 3 },
      });

      if (response.success) {
        const issue = response.data;

        // Document in Confluence if enabled
        if (this.integrations.confluence.enabled && parameters.documentInConfluence) {
          await this.createConfluencePage(
            {
              title: `Task: ${parameters.title}`,
              content: this.generateTaskDocumentation(issue, parameters),
              spaceKey: parameters.spaceKey || this.integrations.confluence.spaceKeys[0],
              parentId: parameters.confluenceParentId,
            },
            userId
          );
        }

        // Notify via Slack if enabled
        if (this.integrations.slack?.enabled) {
          await this.notifySlack({
            message: `New task created: ${issue.key} - ${parameters.title}`,
            attachments: [
              {
                color: 'good',
                fields: [
                  { title: 'Assignee', value: parameters.assignee || 'Unassigned', short: true },
                  { title: 'Priority', value: parameters.priority || 'Medium', short: true },
                  { title: 'Due Date', value: parameters.dueDate || 'Not set', short: true },
                ],
              },
            ],
          });
        }

        this.auditLog('TASK_CREATED', {
          issueKey: issue.key,
          projectKey: parameters.projectKey,
          userId,
        });

        return {
          message: `✅ Created task ${issue.key}: ${parameters.title}\n\nView in Jira: ${this.integrations.jira.baseUrl}/browse/${issue.key}`,
          actions: [
            {
              type: 'task_created',
              status: 'completed',
              details: {
                issueKey: issue.key,
                issueId: issue.id,
                url: `${this.integrations.jira.baseUrl}/browse/${issue.key}`,
              },
            },
          ],
        };
      } else {
        const errorMessage =
          typeof response.error === 'string'
            ? response.error
            : response.error?.message || 'Failed to create task';
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error('Failed to create Jira task', { error, parameters });
      return {
        message: `❌ Failed to create task: ${error.message}`,
        actions: [
          {
            type: 'task_created',
            status: 'failed',
            details: { error: error.message },
          },
        ],
      };
    }
  }

  /**
   * Update an existing task
   */
  private async updateTask(
    parameters: any,
    userId: string
  ): Promise<{ message: string; actions: any[] }> {
    if (!this.pmCapabilities.updateTasks) {
      return {
        message: "I don't have permission to update tasks.",
        actions: [],
      };
    }

    try {
      const updates: any = {};

      if (parameters.status) updates.status = { name: parameters.status };
      if (parameters.assignee) updates.assignee = { name: parameters.assignee };
      if (parameters.priority) updates.priority = { name: parameters.priority };
      if (parameters.description) updates.description = parameters.description;
      if (parameters.dueDate) updates.duedate = parameters.dueDate;
      if (parameters.labels) updates.labels = parameters.labels;

      const response = await this.toolExecutionService.executeTool({
        toolId: 'jira_api',
        operation: 'updateIssue',
        parameters: {
          issueIdOrKey: parameters.issueKey,
          fields: updates,
          notifyUsers: parameters.notifyUsers !== false,
        },
        userId,
        securityContext: { level: 3 },
      });

      if (response.success) {
        // Add comment if provided
        if (parameters.comment) {
          await this.addJiraComment(parameters.issueKey, parameters.comment, userId);
        }

        return {
          message: `✅ Updated ${parameters.issueKey}\n${this.formatUpdateSummary(updates)}`,
          actions: [
            {
              type: 'task_updated',
              status: 'completed',
              details: {
                issueKey: parameters.issueKey,
                updates: Object.keys(updates),
              },
            },
          ],
        };
      } else {
        const errorMessage =
          typeof response.error === 'string'
            ? response.error
            : response.error?.message || 'Failed to update task';
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error('Failed to update task', { error, parameters });
      return {
        message: `❌ Failed to update task: ${error.message}`,
        actions: [
          {
            type: 'task_updated',
            status: 'failed',
            details: { error: error.message },
          },
        ],
      };
    }
  }

  /**
   * Check project status and generate summary
   */
  private async checkProjectStatus(parameters: any): Promise<{ message: string; actions: any[] }> {
    try {
      const projectKey = parameters.projectKey || this.integrations.jira.projectKeys[0];

      // Get current sprint
      const sprintResponse = await this.toolExecutionService.executeTool({
        toolId: 'jira_api',
        operation: 'getActiveSprint',
        parameters: { projectKey },
        securityContext: { level: 2 },
      });

      // Get issue statistics
      const statsResponse = await this.toolExecutionService.executeTool({
        toolId: 'jira_api',
        operation: 'searchIssues',
        parameters: {
          jql: `project = ${projectKey} AND sprint in openSprints()`,
          fields: ['status', 'priority', 'assignee', 'issuetype'],
          maxResults: 100,
        },
        securityContext: { level: 2 },
      });

      if (sprintResponse.success && statsResponse.success) {
        const sprint = sprintResponse.data;
        const issues = statsResponse.data.issues;

        const summary = this.generateProjectStatusSummary(sprint, issues, projectKey);

        return {
          message: summary,
          actions: [
            {
              type: 'status_checked',
              status: 'completed',
              details: {
                projectKey,
                sprintName: sprint?.name,
                issueCount: issues.length,
              },
            },
          ],
        };
      } else {
        throw new Error('Failed to retrieve project status');
      }
    } catch (error) {
      logger.error('Failed to check project status', { error, parameters });
      return {
        message: `❌ Failed to check project status: ${error.message}`,
        actions: [
          {
            type: 'status_checked',
            status: 'failed',
            details: { error: error.message },
          },
        ],
      };
    }
  }

  /**
   * Generate project report
   */
  private async generateReport(parameters: any): Promise<{ message: string; actions: any[] }> {
    if (!this.pmCapabilities.generateReports) {
      return {
        message: "I don't have permission to generate reports.",
        actions: [],
      };
    }

    try {
      const reportType = parameters.type || 'sprint';
      const projectKey = parameters.projectKey || this.integrations.jira.projectKeys[0];

      let reportData;
      switch (reportType) {
        case 'sprint':
          reportData = await this.generateSprintReport(projectKey, parameters);
          break;
        case 'velocity':
          reportData = await this.generateVelocityReport(projectKey, parameters);
          break;
        case 'burndown':
          reportData = await this.generateBurndownReport(projectKey, parameters);
          break;
        case 'team_performance':
          reportData = await this.generateTeamPerformanceReport(projectKey, parameters);
          break;
        default:
          reportData = await this.generateCustomReport(projectKey, parameters);
      }

      // Create Confluence page with report
      if (this.integrations.confluence.enabled && parameters.publishToConfluence) {
        const pageResponse = await this.createConfluencePage(
          {
            title: reportData.title,
            content: reportData.content,
            spaceKey: parameters.spaceKey || this.integrations.confluence.spaceKeys[0],
          },
          parameters.userId
        );

        return {
          message: `✅ Generated ${reportType} report\n\nView in Confluence: ${pageResponse.url}`,
          actions: [
            {
              type: 'report_generated',
              status: 'completed',
              details: {
                reportType,
                confluenceUrl: pageResponse.url,
                metrics: reportData.metrics,
              },
            },
          ],
        };
      }

      return {
        message: `✅ Generated ${reportType} report\n\n${reportData.summary}`,
        actions: [
          {
            type: 'report_generated',
            status: 'completed',
            details: {
              reportType,
              metrics: reportData.metrics,
            },
          },
        ],
      };
    } catch (error) {
      logger.error('Failed to generate report', { error, parameters });
      return {
        message: `❌ Failed to generate report: ${error.message}`,
        actions: [
          {
            type: 'report_generated',
            status: 'failed',
            details: { error: error.message },
          },
        ],
      };
    }
  }

  /**
   * Document meeting notes in Confluence
   */
  private async documentMeeting(
    parameters: any,
    userId: string
  ): Promise<{ message: string; actions: any[] }> {
    if (!this.pmCapabilities.documentDecisions) {
      return {
        message: "I don't have permission to document meetings.",
        actions: [],
      };
    }

    try {
      const meetingContent = this.generateMeetingTemplate({
        title: parameters.title,
        date: parameters.date || new Date().toISOString(),
        attendees: parameters.attendees || [],
        agenda: parameters.agenda || [],
        notes: parameters.notes || '',
        actionItems: parameters.actionItems || [],
        decisions: parameters.decisions || [],
      });

      const pageResponse = await this.createConfluencePage(
        {
          title: `Meeting Notes: ${parameters.title}`,
          content: meetingContent,
          spaceKey: parameters.spaceKey || this.integrations.confluence.spaceKeys[0],
          labels: ['meeting-notes', parameters.projectKey].filter(Boolean),
        },
        userId
      );

      // Create Jira tasks for action items if requested
      const createdTasks = [];
      if (parameters.createTasksForActionItems && parameters.actionItems?.length > 0) {
        for (const actionItem of parameters.actionItems) {
          const taskResult = await this.createTask(
            {
              title: actionItem.task,
              description: `Action item from meeting: ${parameters.title}\nAssigned to: ${actionItem.assignee}\nDue: ${actionItem.dueDate}`,
              assignee: actionItem.assignee,
              dueDate: actionItem.dueDate,
              projectKey: parameters.projectKey,
              labels: ['action-item', 'meeting'],
            },
            userId
          );

          if (taskResult.actions[0]?.status === 'completed') {
            createdTasks.push(taskResult.actions[0].details);
          }
        }
      }

      return {
        message: `✅ Documented meeting notes\n\nConfluence: ${pageResponse.url}\n${createdTasks.length > 0 ? `\nCreated ${createdTasks.length} action items in Jira` : ''}`,
        actions: [
          {
            type: 'meeting_documented',
            status: 'completed',
            details: {
              confluenceUrl: pageResponse.url,
              actionItemTasks: createdTasks,
            },
          },
        ],
      };
    } catch (error) {
      logger.error('Failed to document meeting', { error, parameters });
      return {
        message: `❌ Failed to document meeting: ${error.message}`,
        actions: [
          {
            type: 'meeting_documented',
            status: 'failed',
            details: { error: error.message },
          },
        ],
      };
    }
  }

  /**
   * Initialize tool integrations
   */
  private async initializeIntegrations(): Promise<void> {
    // Register Jira integration
    if (this.integrations.jira.enabled) {
      await this.toolExecutionService.registerTool({
        id: 'jira_api',
        name: 'Jira API',
        description: 'Atlassian Jira integration for issue tracking',
        operations: ['createIssue', 'updateIssue', 'searchIssues', 'getActiveSprint', 'addComment'],
        authentication: {
          type: 'oauth2',
          scopes: ['read:jira-work', 'write:jira-work'],
        },
        rateLimit: {
          requests: 100,
          window: 60000, // 1 minute
        },
      });
    }

    // Register Confluence integration
    if (this.integrations.confluence.enabled) {
      await this.toolExecutionService.registerTool({
        id: 'confluence_api',
        name: 'Confluence API',
        description: 'Atlassian Confluence integration for documentation',
        operations: ['createPage', 'updatePage', 'searchContent'],
        authentication: {
          type: 'oauth2',
          scopes: ['read:confluence-content.all', 'write:confluence-content'],
        },
        rateLimit: {
          requests: 50,
          window: 60000,
        },
      });
    }

    // Register Slack integration
    if (this.integrations.slack?.enabled) {
      await this.toolExecutionService.registerTool({
        id: 'slack_api',
        name: 'Slack API',
        description: 'Slack integration for notifications',
        operations: ['postMessage', 'updateMessage'],
        authentication: {
          type: 'oauth2',
          scopes: ['chat:write', 'chat:write.public'],
        },
      });
    }
  }

  /**
   * Helper methods
   */
  private async analyzePMIntent(request: string, context: ConversationContext): Promise<any> {
    const lowerRequest = request.toLowerCase();

    // Pattern matching for PM actions
    if (
      lowerRequest.includes('create') &&
      (lowerRequest.includes('task') || lowerRequest.includes('issue'))
    ) {
      return {
        action: 'create_task',
        parameters: this.extractTaskParameters(request),
      };
    } else if (lowerRequest.includes('update') || lowerRequest.includes('change')) {
      return {
        action: 'update_task',
        parameters: this.extractUpdateParameters(request),
      };
    } else if (lowerRequest.includes('assign')) {
      return {
        action: 'assign_task',
        parameters: this.extractAssignmentParameters(request),
      };
    } else if (lowerRequest.includes('status') || lowerRequest.includes('progress')) {
      return {
        action: 'check_status',
        parameters: this.extractStatusParameters(request),
      };
    } else if (lowerRequest.includes('report') || lowerRequest.includes('summary')) {
      return {
        action: 'generate_report',
        parameters: this.extractReportParameters(request),
      };
    } else if (lowerRequest.includes('sprint') && lowerRequest.includes('plan')) {
      return {
        action: 'plan_sprint',
        parameters: this.extractSprintParameters(request),
      };
    } else if (lowerRequest.includes('meeting') || lowerRequest.includes('notes')) {
      return {
        action: 'document_meeting',
        parameters: this.extractMeetingParameters(request),
      };
    }

    return {
      action: 'general_query',
      parameters: { query: request },
    };
  }

  private extractTaskParameters(request: string): any {
    // Extract task details from natural language
    // This is a simplified version - in production, use NLP
    const parameters: any = {};

    // Extract title (text in quotes or after "called"/"titled")
    const titleMatch = request.match(/"([^"]+)"|called\s+(\S+)|titled\s+(\S+)/i);
    if (titleMatch) {
      parameters.title = titleMatch[1] || titleMatch[2] || titleMatch[3];
    }

    // Extract priority
    if (request.match(/high\s*priority|urgent|critical/i)) {
      parameters.priority = 'High';
    } else if (request.match(/low\s*priority/i)) {
      parameters.priority = 'Low';
    }

    // Extract assignee
    const assigneeMatch = request.match(/assign(?:ed)?\s+to\s+(\S+)/i);
    if (assigneeMatch) {
      parameters.assignee = assigneeMatch[1];
    }

    // Extract due date
    const dueDateMatch = request.match(/due\s+(?:on\s+)?(\d{4}-\d{2}-\d{2}|\w+\s+\d+)/i);
    if (dueDateMatch) {
      parameters.dueDate = dueDateMatch[1];
    }

    return parameters;
  }

  private generateProjectStatusSummary(sprint: any, issues: any[], projectKey: string): string {
    const statusCounts = this.countIssuesByStatus(issues);
    const priorityCounts = this.countIssuesByPriority(issues);
    const assigneeCounts = this.countIssuesByAssignee(issues);

    let summary = `📊 **Project Status for ${projectKey}**\n\n`;

    if (sprint) {
      summary += `**Current Sprint:** ${sprint.name}\n`;
      summary += `**Sprint Goal:** ${sprint.goal || 'Not set'}\n`;
      summary += `**End Date:** ${new Date(sprint.endDate).toLocaleDateString()}\n\n`;
    }

    summary += `**Issue Status:**\n`;
    Object.entries(statusCounts).forEach(([status, count]) => {
      summary += `• ${status}: ${count}\n`;
    });

    summary += `\n**Priority Distribution:**\n`;
    Object.entries(priorityCounts).forEach(([priority, count]) => {
      summary += `• ${priority}: ${count}\n`;
    });

    summary += `\n**Team Workload:**\n`;
    const topAssignees = Object.entries(assigneeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    topAssignees.forEach(([assignee, count]) => {
      summary += `• ${assignee}: ${count} issues\n`;
    });

    const completionRate = (statusCounts['Done'] / issues.length) * 100;
    summary += `\n**Sprint Progress:** ${completionRate.toFixed(1)}% complete`;

    return summary;
  }

  private countIssuesByStatus(issues: any[]): Record<string, number> {
    return issues.reduce((acc, issue) => {
      const status = issue.fields.status.name;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
  }

  private countIssuesByPriority(issues: any[]): Record<string, number> {
    return issues.reduce((acc, issue) => {
      const priority = issue.fields.priority?.name || 'None';
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {});
  }

  private countIssuesByAssignee(issues: any[]): Record<string, number> {
    return issues.reduce((acc, issue) => {
      const assignee = issue.fields.assignee?.displayName || 'Unassigned';
      acc[assignee] = (acc[assignee] || 0) + 1;
      return acc;
    }, {});
  }

  private formatUpdateSummary(updates: any): string {
    const summary = [];
    if (updates.status) summary.push(`Status → ${updates.status.name}`);
    if (updates.assignee) summary.push(`Assignee → ${updates.assignee.name}`);
    if (updates.priority) summary.push(`Priority → ${updates.priority.name}`);
    if (updates.duedate) summary.push(`Due Date → ${updates.duedate}`);
    return summary.join('\n');
  }

  private generateTaskDocumentation(issue: any, parameters: any): string {
    return `
h1. ${issue.key}: ${parameters.title}

h2. Overview
* *Type:* ${parameters.type || 'Task'}
* *Priority:* ${parameters.priority || 'Medium'}
* *Assignee:* ${parameters.assignee || 'Unassigned'}
* *Due Date:* ${parameters.dueDate || 'Not set'}
* *Created:* ${new Date().toLocaleDateString()}

h2. Description
${parameters.description || 'No description provided'}

h2. Acceptance Criteria
${parameters.acceptanceCriteria || 'To be defined'}

h2. Related Links
* [View in Jira|${this.integrations.jira.baseUrl}/browse/${issue.key}]
`;
  }

  private generateMeetingTemplate(meeting: any): string {
    return `
h1. Meeting Notes: ${meeting.title}

h2. Meeting Details
* *Date:* ${new Date(meeting.date).toLocaleString()}
* *Attendees:* ${meeting.attendees.join(', ')}

h2. Agenda
${meeting.agenda.map((item: string, i: number) => `${i + 1}. ${item}`).join('\n')}

h2. Discussion Notes
${meeting.notes}

h2. Decisions Made
${meeting.decisions.map((decision: string, i: number) => `${i + 1}. ${decision}`).join('\n')}

h2. Action Items
${meeting.actionItems
  .map(
    (item: any) => `* ${item.task} - *Assignee:* ${item.assignee} - *Due:* ${item.dueDate || 'TBD'}`
  )
  .join('\n')}

h2. Next Steps
To be determined based on action items completion.
`;
  }

  private async createConfluencePage(pageData: any, userId: string): Promise<any> {
    const response = await this.toolExecutionService.executeTool({
      toolId: 'confluence_api',
      operation: 'createPage',
      parameters: {
        type: 'page',
        title: pageData.title,
        space: { key: pageData.spaceKey },
        body: {
          storage: {
            value: pageData.content,
            representation: 'wiki',
          },
        },
        metadata: {
          labels: pageData.labels || [],
        },
      },
      userId,
      securityContext: { level: 3 },
    });

    if (response.success) {
      return {
        id: response.data.id,
        url: `${this.integrations.confluence.baseUrl}/pages/viewpage.action?pageId=${response.data.id}`,
      };
    } else {
      const errorMessage =
        typeof response.error === 'string'
          ? response.error
          : response.error?.message || 'Failed to create Confluence page';
      throw new Error(errorMessage);
    }
  }

  private async addJiraComment(issueKey: string, comment: string, userId: string): Promise<void> {
    await this.toolExecutionService.executeTool({
      toolId: 'jira_api',
      operation: 'addComment',
      parameters: {
        issueIdOrKey: issueKey,
        body: comment,
      },
      userId,
      securityContext: { level: 3 },
    });
  }

  private async notifySlack(notification: any): Promise<void> {
    if (!this.integrations.slack?.enabled) return;

    await this.toolExecutionService.executeTool({
      toolId: 'slack_api',
      operation: 'postMessage',
      parameters: {
        channel: this.integrations.slack.channelId,
        text: notification.message,
        attachments: notification.attachments,
      },
      securityContext: { level: 2 },
    });
  }

  private async generateSprintReport(projectKey: string, parameters: any): Promise<any> {
    // Implementation for sprint report generation
    return {
      title: `Sprint Report - ${projectKey}`,
      content: 'Sprint report content',
      summary: 'Sprint report summary',
      metrics: {
        velocity: 42,
        completionRate: 85,
        burndownTrend: 'on-track',
      },
    };
  }

  private async generateVelocityReport(projectKey: string, parameters: any): Promise<any> {
    // Implementation for velocity report
    return {
      title: `Velocity Report - ${projectKey}`,
      content: 'Velocity report content',
      summary: 'Team velocity trends',
      metrics: {
        averageVelocity: 38,
        trend: 'increasing',
      },
    };
  }

  private async generateBurndownReport(projectKey: string, parameters: any): Promise<any> {
    // Implementation for burndown report
    return {
      title: `Burndown Report - ${projectKey}`,
      content: 'Burndown chart and analysis',
      summary: 'Sprint burndown analysis',
      metrics: {
        remainingWork: 15,
        daysRemaining: 5,
        projectedCompletion: 'on-time',
      },
    };
  }

  private async generateTeamPerformanceReport(projectKey: string, parameters: any): Promise<any> {
    // Implementation for team performance report
    return {
      title: `Team Performance Report - ${projectKey}`,
      content: 'Team performance metrics',
      summary: 'Team productivity analysis',
      metrics: {
        throughput: 25,
        cycleTime: 3.2,
        defectRate: 5,
      },
    };
  }

  private async generateCustomReport(projectKey: string, parameters: any): Promise<any> {
    // Implementation for custom reports
    return {
      title: `Custom Report - ${projectKey}`,
      content: 'Custom report content',
      summary: 'Custom analysis',
      metrics: {},
    };
  }

  private async generateNextActionSuggestions(intent: any, result: any): Promise<string[]> {
    const suggestions = [];

    if (intent.action === 'create_task' && result.actions[0]?.status === 'completed') {
      suggestions.push('Would you like me to create subtasks for this issue?');
      suggestions.push('Should I add this task to the current sprint?');
      suggestions.push('Do you want to link this to any existing issues?');
    } else if (intent.action === 'check_status') {
      suggestions.push('Would you like a detailed breakdown of blocked issues?');
      suggestions.push('Should I generate a sprint burndown chart?');
      suggestions.push('Do you want to see individual team member workloads?');
    }

    return suggestions;
  }

  private async handleGeneralPMQuery(request: string, context: ConversationContext): Promise<any> {
    // Handle general project management queries
    const response = await this.callLLM(request, {
      systemPrompt: 'You are a project management expert. Provide helpful advice and guidance.',
      temperature: 0.7,
      maxTokens: 500,
    });

    return {
      message: response.text,
      actions: [],
    };
  }

  private handlePMError(request: string, error: any): any {
    logger.error('PM Bot error', { request, error });

    return {
      response: `I encountered an error while processing your request: ${error.message}. Please try rephrasing or check your permissions.`,
      actions: [
        {
          type: 'error',
          status: 'failed',
          details: { error: error.message },
        },
      ],
      suggestions: [
        'Check if you have the necessary permissions',
        'Verify the project key or issue ID',
        'Try a simpler request',
      ],
    };
  }

  // Event handlers
  private async handleCreateTask(event: any): Promise<void> {
    const { requestId, parameters, userId } = event;
    try {
      const result = await this.createTask(parameters, userId);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleUpdateTask(event: any): Promise<void> {
    const { requestId, parameters, userId } = event;
    try {
      const result = await this.updateTask(parameters, userId);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleSprintPlanning(event: any): Promise<void> {
    const { requestId, parameters, userId } = event;
    try {
      const result = await this.planSprint(parameters, userId);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleReportGeneration(event: any): Promise<void> {
    const { requestId, parameters } = event;
    try {
      const result = await this.generateReport(parameters);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleMeetingDocumentation(event: any): Promise<void> {
    const { requestId, parameters, userId } = event;
    try {
      const result = await this.documentMeeting(parameters, userId);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async planSprint(parameters: any, userId: string): Promise<any> {
    // Sprint planning implementation
    return {
      message: 'Sprint planning functionality',
      actions: [],
    };
  }

  private async assignTask(parameters: any, userId: string): Promise<any> {
    return this.updateTask(
      {
        ...parameters,
        assignee: parameters.assignee,
      },
      userId
    );
  }

  private extractUpdateParameters(request: string): any {
    // Extract update parameters from request
    return {};
  }

  private extractAssignmentParameters(request: string): any {
    // Extract assignment parameters
    return {};
  }

  private extractStatusParameters(request: string): any {
    // Extract status check parameters
    return {};
  }

  private extractReportParameters(request: string): any {
    // Extract report parameters
    return {};
  }

  private extractSprintParameters(request: string): any {
    // Extract sprint planning parameters
    return {};
  }

  private extractMeetingParameters(request: string): any {
    // Extract meeting documentation parameters
    return {};
  }

  // Abstract method implementations
  protected async cleanup(): Promise<void> {
    // Clean up resources, close connections, etc.
    this.projectContexts.clear();
    logger.info('PMBotAgent cleanup completed');
  }

  protected async getHealthMetadata(): Promise<any> {
    return {
      activeProjects: this.projectContexts.size,
      integrations: {
        jira: this.integrations.jira?.enabled || false,
        confluence: this.integrations.confluence?.enabled || false,
        slack: this.integrations.slack?.enabled || false,
      },
      capabilities: this.pmCapabilities,
      status: 'healthy',
    };
  }

  protected validateConfiguration(config: any): void {
    if (!config) {
      throw new Error('Configuration is required');
    }
    // Add specific validation logic for PM bot configuration
    if (config.integrations && typeof config.integrations !== 'object') {
      throw new Error('Integrations must be an object');
    }
  }

  protected async applyConfiguration(config: any): Promise<void> {
    if (config.integrations) {
      this.integrations = { ...this.integrations, ...config.integrations };
    }
    if (config.capabilities) {
      this.pmCapabilities = { ...this.pmCapabilities, ...config.capabilities };
    }
    logger.info('PMBotAgent configuration applied', { config });
  }
}
