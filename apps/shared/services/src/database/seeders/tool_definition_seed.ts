import { getControlDb } from '../drizzle/clients/index';
import { toolDefinitions, type ToolDefinition } from '../../database/drizzle/schemas/control_schema';
import { BaseSeed } from './base_seed';
import { ToolCategory, SecurityLevel } from '@uaip/types';
import type { InferInsertModel } from 'drizzle-orm';

type ToolDefinitionInsert = InferInsertModel<typeof toolDefinitions>;

export class ToolDefinitionSeed extends BaseSeed {
  private db = getControlDb();

  constructor() {
    super('ToolDefinitions');
  }

  async seed(): Promise<ToolDefinition[]> {
    const seedData = await this.getSeedData();

    for (const tool of seedData) {
      await this.db
        .insert(toolDefinitions)
        .values(tool)
        .onConflictDoNothing();
    }

    return await this.db.select().from(toolDefinitions);
  }

  async getSeedData(): Promise<ToolDefinitionInsert[]> {
    return [
      {
        name: 'File System Reader',
        description: 'Tool for reading files and directories from the file system',
        category: ToolCategory.SYSTEM,
        version: '1.0.0',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file or directory to read',
            },
            encoding: {
              type: 'string',
              description: 'File encoding (default: utf-8)',
              default: 'utf-8',
            },
          },
          required: ['path'],
        },
        returnType: {
          type: 'string',
          description: 'File content or directory listing',
        },
        securityLevel: SecurityLevel.MEDIUM,
        author: 'UAIP System',
        tags: ['filesystem', 'read', 'utility'],
        examples: [
          {
            name: 'Read text file',
            description: 'Read a text file from the filesystem',
            input: { path: '/home/user/document.txt' },
            expectedOutput: 'File content as string',
          },
        ],
        rateLimits: {
          maxCallsPerMinute: 60,
          maxCallsPerHour: 1000,
        },
        dependencies: [],
        isEnabled: true,
        requiresApproval: false,
      },
      {
        name: 'HTTP Request',
        description: 'Tool for making HTTP requests to external APIs',
        category: ToolCategory.NETWORK,
        version: '2.1.0',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to make the request to',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
              description: 'HTTP method',
              default: 'GET',
            },
            headers: {
              type: 'object',
              description: 'HTTP headers',
            },
            body: {
              type: 'object',
              description: 'Request body for POST/PUT requests',
            },
            timeout: {
              type: 'number',
              description: 'Request timeout in milliseconds',
              default: 30000,
            },
          },
          required: ['url'],
        },
        returnType: {
          type: 'object',
          properties: {
            status: { type: 'number' },
            headers: { type: 'object' },
            body: { type: 'any' },
          },
        },
        securityLevel: SecurityLevel.HIGH,
        author: 'UAIP System',
        tags: ['http', 'api', 'network', 'request'],
        examples: [
          {
            name: 'GET API request',
            description: 'Make a GET request to an external API',
            input: {
              url: 'https://api.example.com/data',
              method: 'GET',
              headers: { Authorization: 'Bearer token' },
            },
            expectedOutput: 'HTTP response object with status, headers, and body',
          },
        ],
        rateLimits: {
          maxCallsPerMinute: 30,
          maxCallsPerHour: 500,
        },
        dependencies: [],
        isEnabled: true,
        requiresApproval: true,
      },
      {
        name: 'Database Query',
        description: 'Tool for executing database queries',
        category: ToolCategory.DATABASE,
        version: '1.5.0',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL query to execute',
            },
            parameters: {
              type: 'array',
              description: 'Query parameters for prepared statements',
            },
            database: {
              type: 'string',
              description: 'Database connection name',
              default: 'default',
            },
          },
          required: ['query'],
        },
        returnType: {
          type: 'array',
          items: { type: 'object' },
          description: 'Query results as array of objects',
        },
        securityLevel: SecurityLevel.CRITICAL,
        author: 'UAIP System',
        tags: ['database', 'sql', 'query'],
        examples: [
          {
            name: 'Select query',
            description: 'Execute a SELECT query with parameters',
            input: {
              query: 'SELECT * FROM users WHERE id = ?',
              parameters: [123],
            },
            expectedOutput: 'Query results as array of objects',
          },
        ],
        rateLimits: {
          maxCallsPerMinute: 10,
          maxCallsPerHour: 100,
        },
        dependencies: [],
        isEnabled: true,
        requiresApproval: true,
      },
      {
        name: 'Code Executor',
        description: 'Tool for executing code in sandboxed environments',
        category: ToolCategory.DEVELOPMENT,
        version: '3.0.0',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Code to execute',
            },
            language: {
              type: 'string',
              enum: ['python', 'javascript', 'typescript', 'bash'],
              description: 'Programming language',
            },
            timeout: {
              type: 'number',
              description: 'Execution timeout in milliseconds',
              default: 30000,
            },
            environment: {
              type: 'object',
              description: 'Environment variables',
            },
          },
          required: ['code', 'language'],
        },
        returnType: {
          type: 'object',
          properties: {
            stdout: { type: 'string' },
            stderr: { type: 'string' },
            exitCode: { type: 'number' },
          },
        },
        securityLevel: SecurityLevel.CRITICAL,
        author: 'UAIP System',
        tags: ['code', 'execution', 'sandbox', 'development'],
        examples: [
          {
            name: 'Python code execution',
            description: 'Execute Python code in a sandbox',
            input: {
              code: 'print("Hello, World!")',
              language: 'python',
            },
            expectedOutput: 'Execution result with stdout, stderr, and exit code',
          },
        ],
        rateLimits: {
          maxCallsPerMinute: 5,
          maxCallsPerHour: 50,
        },
        dependencies: [],
        isEnabled: true,
        requiresApproval: true,
      },
      ...this.getProjectTaskTools(),
      ...this.getCalendarTools(),
    ];
  }

  /**
   * Names must stay byte-identical to CALENDAR_TOOL_IDS — the seed name is the
   * dispatch key BaseToolExecutor switches on.
   */
  private getCalendarTools(): ToolDefinitionInsert[] {
    const shared = {
      category: ToolCategory.API,
      version: '1.0.0',
      author: 'UAIP System',
      dependencies: [] as string[],
      isEnabled: true,
      requiresApproval: false,
      rateLimits: { maxCallsPerMinute: 60, maxCallsPerHour: 1000 },
    };

    const userIdParam = {
      type: 'string',
      description:
        'ID of the user the agent is acting for. Selects that user\u2019s connected Google account.',
    };
    const calendarIdParam = {
      type: 'string',
      description: 'Calendar id. Defaults to the user\u2019s primary calendar.',
    };

    return [
      {
        ...shared,
        name: 'calendar-list',
        description: 'List the calendars on the connected Google account',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            limit: { type: 'number', description: 'Maximum calendars to return (default 50)' },
          },
          required: ['userId'],
        },
        returnType: {
          type: 'object',
          description: 'Calendars and a count',
          properties: { calendars: { type: 'array' }, count: { type: 'number' } },
        },
        securityLevel: SecurityLevel.LOW,
        tags: ['calendar', 'read', 'google'],
        examples: [
          {
            name: 'List calendars',
            description: 'List every calendar the user can see',
            input: { userId: 'user-uuid' },
            expectedOutput: 'Array of calendar summaries with a count',
          },
        ],
      },
      {
        ...shared,
        name: 'calendar-events-list',
        description: 'List events in a window, optionally filtered by a search query',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            calendarId: calendarIdParam,
            timeMin: { type: 'string', description: 'Window start as an ISO 8601 timestamp' },
            timeMax: { type: 'string', description: 'Window end as an ISO 8601 timestamp' },
            query: { type: 'string', description: 'Free-text search over event fields' },
            limit: { type: 'number', description: 'Maximum events to return (default 50)' },
          },
          required: ['userId'],
        },
        returnType: {
          type: 'object',
          description: 'Matching events and a count',
          properties: { events: { type: 'array' }, count: { type: 'number' } },
        },
        securityLevel: SecurityLevel.LOW,
        tags: ['calendar', 'read', 'google'],
        examples: [
          {
            name: "List this week's events",
            description: 'List events inside a time window',
            input: {
              userId: 'user-uuid',
              timeMin: '2026-08-03T00:00:00Z',
              timeMax: '2026-08-10T00:00:00Z',
            },
            expectedOutput: 'Array of event summaries with a count',
          },
        ],
      },
      {
        ...shared,
        name: 'calendar-event-get',
        description: 'Fetch a single calendar event by id',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            calendarId: calendarIdParam,
            eventId: { type: 'string', description: 'ID of the event to fetch' },
          },
          required: ['userId', 'eventId'],
        },
        returnType: { type: 'object', description: 'Event summary' },
        securityLevel: SecurityLevel.LOW,
        tags: ['calendar', 'read', 'google'],
        examples: [
          {
            name: 'Get event',
            description: 'Fetch one event by id',
            input: { userId: 'user-uuid', eventId: 'event-id' },
            expectedOutput: 'Event summary object',
          },
        ],
      },
      {
        ...shared,
        name: 'calendar-event-create',
        description: 'Create a calendar event',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            calendarId: calendarIdParam,
            title: { type: 'string', description: 'Event title' },
            description: { type: 'string', description: 'Event description' },
            location: { type: 'string', description: 'Event location' },
            startAt: { type: 'string', description: 'Start as an ISO 8601 timestamp' },
            endAt: { type: 'string', description: 'End as an ISO 8601 timestamp' },
            timeZone: { type: 'string', description: 'IANA time zone, e.g. Asia/Kolkata' },
            attendees: {
              type: 'array',
              items: { type: 'string' },
              description: 'Attendee email addresses',
            },
          },
          required: ['userId', 'title', 'startAt', 'endAt'],
        },
        returnType: { type: 'object', description: 'The created event summary' },
        securityLevel: SecurityLevel.MEDIUM,
        tags: ['calendar', 'write', 'google'],
        examples: [
          {
            name: 'Create a meeting',
            description: 'Create a one-hour meeting with an attendee',
            input: {
              userId: 'user-uuid',
              title: 'Design review',
              startAt: '2026-08-04T10:00:00Z',
              endAt: '2026-08-04T11:00:00Z',
              attendees: ['someone@example.com'],
            },
            expectedOutput: 'The created event summary',
          },
        ],
      },
      {
        ...shared,
        name: 'calendar-event-update',
        description: 'Update fields on an existing calendar event',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            calendarId: calendarIdParam,
            eventId: { type: 'string', description: 'ID of the event to update' },
            title: { type: 'string', description: 'New title' },
            description: { type: 'string', description: 'New description' },
            location: { type: 'string', description: 'New location' },
            startAt: { type: 'string', description: 'New start as an ISO 8601 timestamp' },
            endAt: { type: 'string', description: 'New end as an ISO 8601 timestamp' },
            timeZone: { type: 'string', description: 'IANA time zone' },
            attendees: {
              type: 'array',
              items: { type: 'string' },
              description: 'Replacement attendee email addresses',
            },
          },
          required: ['userId', 'eventId'],
        },
        returnType: { type: 'object', description: 'The updated event summary' },
        securityLevel: SecurityLevel.MEDIUM,
        tags: ['calendar', 'write', 'google'],
        examples: [
          {
            name: 'Reschedule an event',
            description: 'Move an event to a new time',
            input: {
              userId: 'user-uuid',
              eventId: 'event-id',
              startAt: '2026-08-05T10:00:00Z',
              endAt: '2026-08-05T11:00:00Z',
            },
            expectedOutput: 'The updated event summary',
          },
        ],
      },
      {
        ...shared,
        name: 'calendar-event-delete',
        description: 'Delete a calendar event',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            calendarId: calendarIdParam,
            eventId: { type: 'string', description: 'ID of the event to delete' },
          },
          required: ['userId', 'eventId'],
        },
        returnType: { type: 'object', description: 'Deletion confirmation' },
        securityLevel: SecurityLevel.MEDIUM,
        tags: ['calendar', 'write', 'google'],
        examples: [
          {
            name: 'Delete an event',
            description: 'Remove an event from the calendar',
            input: { userId: 'user-uuid', eventId: 'event-id' },
            expectedOutput: '{ deleted: true }',
          },
        ],
      },
      {
        ...shared,
        name: 'calendar-freebusy',
        description: 'Check busy intervals across calendars to find free time',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            timeMin: { type: 'string', description: 'Window start as an ISO 8601 timestamp' },
            timeMax: { type: 'string', description: 'Window end as an ISO 8601 timestamp' },
            calendarIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Calendars to check. Defaults to the primary calendar.',
            },
          },
          required: ['userId', 'timeMin', 'timeMax'],
        },
        returnType: {
          type: 'object',
          description: 'Busy intervals and whether the window is entirely free',
          properties: { busy: { type: 'array' }, isFree: { type: 'boolean' } },
        },
        securityLevel: SecurityLevel.LOW,
        tags: ['calendar', 'read', 'scheduling', 'google'],
        examples: [
          {
            name: 'Find free time',
            description: 'Check whether an afternoon is free',
            input: {
              userId: 'user-uuid',
              timeMin: '2026-08-04T12:00:00Z',
              timeMax: '2026-08-04T18:00:00Z',
            },
            expectedOutput: 'busy intervals plus isFree',
          },
        ],
      },
    ];
  }

  /**
   * Tool `name` is the lookup key: UnifiedToolRegistry.getTool() falls back to
   * findToolByName for non-UUID ids, and BaseToolExecutor switches on the same
   * string. These names must stay byte-identical to PROJECT_TASK_TOOL_IDS.
   */
  private getProjectTaskTools(): ToolDefinitionInsert[] {
    const shared = {
      category: ToolCategory.API,
      version: '1.0.0',
      author: 'UAIP System',
      dependencies: [] as string[],
      isEnabled: true,
      requiresApproval: false,
      rateLimits: { maxCallsPerMinute: 60, maxCallsPerHour: 1000 },
    };

    const userIdParam = {
      type: 'string',
      description:
        'ID of the user the agent is acting for. Scopes every result to that user\u2019s projects.',
    };

    return [
      {
        ...shared,
        name: 'project-list',
        description: 'List the projects the acting user owns or is a member of',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            status: { type: 'string', description: 'Filter by project status' },
            limit: { type: 'number', description: 'Maximum projects to return (default 50)' },
          },
          required: ['userId'],
        },
        returnType: {
          type: 'object',
          description: 'Accessible projects and a count',
          properties: { projects: { type: 'array' }, count: { type: 'number' } },
        },
        securityLevel: SecurityLevel.LOW,
        tags: ['project', 'read', 'management'],
        examples: [
          {
            name: 'List active projects',
            description: 'List every active project the user can see',
            input: { userId: 'user-uuid', status: 'active' },
            expectedOutput: 'Array of project summaries with a count',
          },
        ],
      },
      {
        ...shared,
        name: 'project-get',
        description: 'Fetch a single project the acting user has access to',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            projectId: { type: 'string', description: 'ID of the project to fetch' },
          },
          required: ['userId', 'projectId'],
        },
        returnType: { type: 'object', description: 'Project summary' },
        securityLevel: SecurityLevel.LOW,
        tags: ['project', 'read', 'management'],
        examples: [
          {
            name: 'Get project',
            description: 'Fetch one project by id',
            input: { userId: 'user-uuid', projectId: 'project-uuid' },
            expectedOutput: 'Project summary object',
          },
        ],
      },
      {
        ...shared,
        name: 'task-list',
        description:
          'List tasks. Scoped to one project when projectId is given, otherwise across every accessible project.',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            projectId: { type: 'string', description: 'Restrict to a single project' },
            status: {
              type: 'string',
              description: 'Filter by status',
              enum: ['pending', 'in_progress', 'blocked', 'completed', 'cancelled'],
            },
            priority: {
              type: 'string',
              description: 'Filter by priority',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            assigneeId: { type: 'string', description: 'Filter by assignee user id' },
            limit: { type: 'number', description: 'Maximum tasks to return (default 100)' },
          },
          required: ['userId'],
        },
        returnType: {
          type: 'object',
          description: 'Matching tasks and a count',
          properties: { tasks: { type: 'array' }, count: { type: 'number' } },
        },
        securityLevel: SecurityLevel.LOW,
        tags: ['task', 'read', 'management'],
        examples: [
          {
            name: 'List open tasks',
            description: 'List in-progress tasks for a project',
            input: { userId: 'user-uuid', projectId: 'project-uuid', status: 'in_progress' },
            expectedOutput: 'Array of task summaries with a count',
          },
        ],
      },
      {
        ...shared,
        name: 'task-get',
        description: 'Fetch a single task the acting user has access to',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            taskId: { type: 'string', description: 'ID of the task to fetch' },
          },
          required: ['userId', 'taskId'],
        },
        returnType: { type: 'object', description: 'Task summary' },
        securityLevel: SecurityLevel.LOW,
        tags: ['task', 'read', 'management'],
        examples: [
          {
            name: 'Get task',
            description: 'Fetch one task by id',
            input: { userId: 'user-uuid', taskId: 'task-uuid' },
            expectedOutput: 'Task summary object',
          },
        ],
      },
      {
        ...shared,
        name: 'task-create',
        description: 'Create a task inside a project the acting user has access to',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            projectId: { type: 'string', description: 'Project the task belongs to' },
            title: { type: 'string', description: 'Short task title' },
            description: { type: 'string', description: 'Longer task description' },
            status: {
              type: 'string',
              description: 'Initial status (default pending)',
              enum: ['pending', 'in_progress', 'blocked', 'completed', 'cancelled'],
            },
            priority: {
              type: 'string',
              description: 'Task priority (default medium)',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            assigneeId: { type: 'string', description: 'User id to assign the task to' },
            dueAt: { type: 'string', description: 'Due date as an ISO 8601 timestamp' },
          },
          required: ['userId', 'projectId', 'title'],
        },
        returnType: { type: 'object', description: 'The created task summary' },
        securityLevel: SecurityLevel.MEDIUM,
        tags: ['task', 'write', 'management'],
        examples: [
          {
            name: 'Create a task',
            description: 'Create a high priority task in a project',
            input: {
              userId: 'user-uuid',
              projectId: 'project-uuid',
              title: 'Fix the login redirect',
              priority: 'high',
            },
            expectedOutput: 'The created task summary',
          },
        ],
      },
      {
        ...shared,
        name: 'task-update',
        description:
          'Update a task the acting user has access to. Setting status to completed stamps completedAt.',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            taskId: { type: 'string', description: 'ID of the task to update' },
            title: { type: 'string', description: 'New title' },
            description: { type: 'string', description: 'New description' },
            status: {
              type: 'string',
              description: 'New status',
              enum: ['pending', 'in_progress', 'blocked', 'completed', 'cancelled'],
            },
            priority: {
              type: 'string',
              description: 'New priority',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            assigneeId: { type: 'string', description: 'Reassign to this user id' },
            dueAt: { type: 'string', description: 'New due date as an ISO 8601 timestamp' },
          },
          required: ['userId', 'taskId'],
        },
        returnType: { type: 'object', description: 'The updated task summary' },
        securityLevel: SecurityLevel.MEDIUM,
        tags: ['task', 'write', 'management'],
        examples: [
          {
            name: 'Complete a task',
            description: 'Mark a task as completed',
            input: { userId: 'user-uuid', taskId: 'task-uuid', status: 'completed' },
            expectedOutput: 'The updated task summary with completedAt set',
          },
        ],
      },
      {
        ...shared,
        name: 'task-stats',
        description: 'Task counts for a project, grouped by status and priority',
        parameters: {
          type: 'object',
          properties: {
            userId: userIdParam,
            projectId: { type: 'string', description: 'Project to summarise' },
          },
          required: ['userId', 'projectId'],
        },
        returnType: {
          type: 'object',
          description: 'Totals grouped by status and priority',
          properties: {
            total: { type: 'number' },
            byStatus: { type: 'object' },
            byPriority: { type: 'object' },
          },
        },
        securityLevel: SecurityLevel.LOW,
        tags: ['task', 'read', 'analytics'],
        examples: [
          {
            name: 'Project task stats',
            description: 'Get task counts for a project',
            input: { userId: 'user-uuid', projectId: 'project-uuid' },
            expectedOutput: 'total, byStatus and byPriority counts',
          },
        ],
      },
    ];
  }
}
