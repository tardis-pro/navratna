import { getControlDb } from '@uaip/shared-services';
import { and, eq, sql } from '@uaip/shared-services/drizzle/clients';
import { projects, tasks, users } from '@uaip/shared-services/drizzle/control.schema';
import { logger } from '@uaip/utils';
import type {
    BoardConfig,
    BoardEpic,
    BoardProject,
    BoardProvider,
    BoardStory,
    EpicSpec,
    StorySpec,
    StoryStatus,
} from '@uaip/types';

type ProjectRow = typeof projects.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;

function toIso(value: Date): string {
    return value.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) {
        return {};
    }
    return value;
}

function getStringField(record: Record<string, unknown>, key: string): string | undefined {
    if (!(key in record)) {
        return undefined;
    }

    const value = record[key];
    return typeof value === 'string' ? value : undefined;
}

function getNumberField(record: Record<string, unknown>, key: string): number | undefined {
    if (!(key in record)) {
        return undefined;
    }

    const value = record[key];
    return typeof value === 'number' ? value : undefined;
}

function getStringArrayField(record: Record<string, unknown>, key: string): string[] | undefined {
    if (!(key in record)) {
        return undefined;
    }

    const value = record[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        return undefined;
    }

    return value;
}

function getBoardStatus(value: string): StoryStatus {
    if (
        value === 'backlog' ||
        value === 'in-progress' ||
        value === 'in-review' ||
        value === 'done' ||
        value === 'blocked' ||
        value === 'needs-triage'
    ) {
        return value;
    }

    return 'backlog';
}

function getBoardConfigType(value: unknown): BoardConfig['type'] {
    if (value === 'internal') {
        return 'internal';
    }

    if (value === 'github') {
        return 'github';
    }

    if (value === 'jira') {
        return 'jira';
    }

    if (value === 'linear') {
        return 'linear';
    }

    return 'internal';
}

function mapProject(row: ProjectRow): BoardProject {
    const metadata = asRecord(row.metadata);
    const settings = asRecord(row.settings);

    const boardConfigValue = settings['boardConfig'];
    const boardConfig = isRecord(boardConfigValue)
        ? ({
            type: getBoardConfigType(getStringField(boardConfigValue, 'type')),
            ...(isRecord(boardConfigValue.credentials)
                ? { credentials: boardConfigValue.credentials }
                : {}),
        } satisfies BoardConfig)
        : undefined;

    return {
        id: row.id,
        title: row.name,
        ...(typeof row.description === 'string' ? { description: row.description } : {}),
        status: getBoardStatus(row.status),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        ...(typeof getStringField(metadata, 'repoUrl') === 'string'
            ? { repoUrl: getStringField(metadata, 'repoUrl') }
            : {}),
        ...(boardConfig ? { boardConfig } : {}),
    };
}

function mapEpic(row: TaskRow): BoardEpic {
    return {
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        ...(typeof row.description === 'string' ? { description: row.description } : {}),
        status: getBoardStatus(row.status),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        ...(typeof row.priority === 'string' ? { priority: row.priority } : {}),
        ...(row.dueAt ? { dueDate: toIso(row.dueAt) } : {}),
    };
}

function mapStory(row: TaskRow): BoardStory {
    const metadata = asRecord(row.metadata);

    return {
        id: row.id,
        epicId: getStringField(metadata, 'parentId') ?? '',
        title: row.title,
        ...(typeof row.description === 'string' ? { description: row.description } : {}),
        status: getBoardStatus(row.status),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        ...(typeof getStringField(metadata, 'assignee') === 'string'
            ? { assignee: getStringField(metadata, 'assignee') }
            : {}),
        ...(typeof getStringField(metadata, 'prUrl') === 'string'
            ? { prUrl: getStringField(metadata, 'prUrl') }
            : {}),
        ...(typeof getNumberField(metadata, 'storyPoints') === 'number'
            ? { storyPoints: getNumberField(metadata, 'storyPoints') }
            : {}),
        ...(Array.isArray(getStringArrayField(metadata, 'labels'))
            ? { labels: getStringArrayField(metadata, 'labels') }
            : {}),
    };
}

export class InternalBoardAdapter implements BoardProvider {
    private async resolveOwnerId(): Promise<string> {
        const db = getControlDb();
        const [owner] = await db.select({ id: users.id }).from(users).limit(1);

        if (!owner) {
            throw new Error('Cannot create board project: no users exist in control plane');
        }

        return owner.id;
    }

    async createProject(name: string, config?: Partial<BoardProject>): Promise<BoardProject> {
        try {
            const db = getControlDb();
            const ownerId = await this.resolveOwnerId();
            const [created] = await db
                .insert(projects)
                .values({
                    name,
                    description: config?.description,
                    status: config?.status ?? 'backlog',
                    ownerId,
                    settings: config?.boardConfig ? { boardConfig: config.boardConfig } : undefined,
                    metadata:
                        typeof config?.repoUrl === 'string'
                            ? {
                                boardItemType: 'project',
                                repoUrl: config.repoUrl,
                            }
                            : { boardItemType: 'project' },
                })
                .returning();

            logger.info('Internal board project created', {
                projectId: created.id,
                title: name,
            });

            return mapProject(created);
        } catch (error) {
            logger.error('Failed to create internal board project', {
                title: name,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async createEpic(projectId: string, spec: EpicSpec): Promise<BoardEpic> {
        try {
            const db = getControlDb();
            const [created] = await db
                .insert(tasks)
                .values({
                    projectId,
                    title: spec.title,
                    description: spec.description,
                    status: 'backlog',
                    priority: spec.priority ?? 'medium',
                    dueAt: spec.dueDate ? new Date(spec.dueDate) : undefined,
                    metadata: {
                        type: 'epic',
                    },
                })
                .returning();

            logger.info('Internal board epic created', {
                epicId: created.id,
                projectId,
            });

            return mapEpic(created);
        } catch (error) {
            logger.error('Failed to create internal board epic', {
                projectId,
                title: spec.title,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async createStory(epicId: string, spec: StorySpec): Promise<BoardStory> {
        try {
            const db = getControlDb();
            const [epic] = await db.select().from(tasks).where(eq(tasks.id, epicId)).limit(1);

            if (!epic) {
                throw new Error(`Epic not found: ${epicId}`);
            }

            const [created] = await db
                .insert(tasks)
                .values({
                    projectId: epic.projectId,
                    title: spec.title,
                    description: spec.description,
                    status: 'backlog',
                    priority: 'medium',
                    metadata: {
                        type: 'story',
                        parentId: epicId,
                        ...(typeof spec.assignee === 'string' ? { assignee: spec.assignee } : {}),
                        ...(typeof spec.storyPoints === 'number' ? { storyPoints: spec.storyPoints } : {}),
                        ...(Array.isArray(spec.labels) ? { labels: spec.labels } : {}),
                    },
                })
                .returning();

            logger.info('Internal board story created', {
                storyId: created.id,
                epicId,
            });

            return mapStory(created);
        } catch (error) {
            logger.error('Failed to create internal board story', {
                epicId,
                title: spec.title,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async updateStatus(itemId: string, status: StoryStatus): Promise<void> {
        try {
            const db = getControlDb();
            const [updated] = await db
                .update(tasks)
                .set({
                    status,
                    updatedAt: new Date(),
                })
                .where(eq(tasks.id, itemId))
                .returning({ id: tasks.id });

            if (!updated) {
                throw new Error(`Board item not found: ${itemId}`);
            }

            logger.info('Internal board item status updated', {
                itemId,
                status,
            });
        } catch (error) {
            logger.error('Failed to update internal board item status', {
                itemId,
                status,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async linkPR(storyId: string, prUrl: string): Promise<void> {
        try {
            const db = getControlDb();
            const [story] = await db.select().from(tasks).where(eq(tasks.id, storyId)).limit(1);

            if (!story) {
                throw new Error(`Story not found: ${storyId}`);
            }

            const metadata = {
                ...asRecord(story.metadata),
                type: 'story',
                prUrl,
            };

            await db
                .update(tasks)
                .set({
                    metadata,
                    updatedAt: new Date(),
                })
                .where(eq(tasks.id, storyId));

            logger.info('Internal board story linked to PR', {
                storyId,
                prUrl,
            });
        } catch (error) {
            logger.error('Failed to link PR to internal board story', {
                storyId,
                prUrl,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async getBacklog(projectId: string): Promise<BoardStory[]> {
        try {
            const db = getControlDb();
            const backlogStories = await db
                .select()
                .from(tasks)
                .where(
                    and(
                        eq(tasks.projectId, projectId),
                        eq(tasks.status, 'backlog'),
                        sql`${tasks.metadata} ->> 'type' = 'story'`
                    )
                );

            const stories = backlogStories
                .map(mapStory)
                .filter((story) => story.epicId.trim().length > 0);

            logger.info('Fetched internal board backlog', {
                projectId,
                stories: stories.length,
            });

            return stories;
        } catch (error) {
            logger.error('Failed to fetch internal board backlog', {
                projectId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
}
