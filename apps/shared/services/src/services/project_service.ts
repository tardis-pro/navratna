import { BaseDomainService } from './base_domain_service';
import { getControlPool } from '../database/drizzle/clients/index';
import { updateTableRow } from './sql_helpers';

export class ProjectService extends BaseDomainService {
  protected constructor() {
    super();
  }

  public static getInstance(): ProjectService {
    return BaseDomainService.resolve<ProjectService>(ProjectService);
  }

  public async createProject(data: {
    name: string;
    description?: string;
    ownerId: string;
    type?: string;
    visibility?: string;
    settings?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const pool = getControlPool();

    const settings = {
      allowFileUploads: true,
      allowArtifactGeneration: true,
      ...data.settings,
    };

    const result = await pool.query(
      `INSERT INTO projects (name, description, owner_id, type, settings, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        data.name,
        data.description || null,
        data.ownerId,
        data.type || null,
        JSON.stringify(settings),
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );

    const project = result.rows[0];
    await this.addProjectMember(project.id, data.ownerId, 'admin');

    return project;
  }

  public async findProjectById(id: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT p.*, u.email as owner_email, u.first_name as owner_first_name, u.last_name as owner_last_name
       FROM projects p
       LEFT JOIN users u ON p.owner_id = u.id
       WHERE p.id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  public async findProjectsByOwner(ownerId: string): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT p.*, pm.role
       FROM projects p
       LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
       WHERE p.owner_id = $1`,
      [ownerId]
    );
    return result.rows;
  }

  public async findProjectsByMember(userId: string): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT p.*, pm.role
       FROM projects p
       INNER JOIN project_members pm ON p.id = pm.project_id
       WHERE pm.user_id = $1`,
      [userId]
    );
    return result.rows;
  }

  public async updateProject(
    id: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    return updateTableRow('projects', id, data, (i) => this.findProjectById(i));
  }

  public async updateProjectStatus(id: string, status: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(
      `UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async deleteProject(id: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(`DELETE FROM projects WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  public async addProjectMember(
    projectId: string,
    userId: string,
    role: string = 'member'
  ): Promise<Record<string, unknown>> {
    const pool = getControlPool();

    const existingResult = await pool.query(
      `SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2 LIMIT 1`,
      [projectId, userId]
    );

    if (existingResult.rows.length > 0) {
      const existing: Record<string, unknown> = existingResult.rows[0];
      if (existing.role !== role) {
        await pool.query(
          `UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3`,
          [role, projectId, userId]
        );
        existing.role = role;
      }
      return existing;
    }

    const result = await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) RETURNING *`,
      [projectId, userId, role]
    );
    return result.rows[0];
  }

  public async removeProjectMember(projectId: string, userId: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(
      `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async updateMemberRole(projectId: string, userId: string, role: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(
      `UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3`,
      [role, projectId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async getProjectMembers(projectId: string): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT pm.*, u.email, u.first_name, u.last_name
       FROM project_members pm
       LEFT JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = $1`,
      [projectId]
    );
    return result.rows;
  }

  public async addProjectFile(data: {
    projectId: string;
    uploadedById: string;
    path: string;
    type?: string;
    size?: number;
    mimeType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const pool = getControlPool();
    const name = data.path.split('/').pop() || 'unnamed';

    const result = await pool.query(
      `INSERT INTO project_files (project_id, name, path, mime_type, size_bytes, uploaded_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        data.projectId,
        name,
        data.path,
        data.mimeType || null,
        data.size || 0,
        data.uploadedById,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
    return result.rows[0];
  }

  public async updateProjectFile(
    id: string,
    data: {
      name?: string;
      description?: string;
      url?: string;
      size?: number;
      mimeType?: string;
      status?: string;
    }
  ): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const keys = Object.keys(data);
    if (keys.length === 0) {
      const result = await pool.query(`SELECT * FROM project_files WHERE id = $1 LIMIT 1`, [id]);
      return result.rows[0] ?? null;
    }
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    // @ts-expect-error -- k is a string key of data; indexing by string is safe here
    const values = [id, ...keys.map((k) => data[k])];
    const result = await pool.query(
      `UPDATE project_files SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );
    return result.rows[0] ?? null;
  }

  public async deleteProjectFile(id: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(`DELETE FROM project_files WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  public async getProjectFiles(projectId: string): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM project_files WHERE project_id = $1 ORDER BY path ASC`,
      [projectId]
    );
    return result.rows;
  }

  private async getProjectAllowedTools(projectId: string): Promise<{ metadata: Record<string, unknown>; tools: string[] }> {
    const project = await this.findProjectById(projectId);
    if (!project) throw new Error('Project not found');
    const metadata: Record<string, unknown> = (project.metadata as Record<string, unknown> | null | undefined) ?? {};
    const tools: string[] = Array.isArray(metadata.allowedTools)
      ? metadata.allowedTools.filter((t): t is string => typeof t === 'string')
      : [];
    return { metadata, tools };
  }

  public async assignToolsToProject(projectId: string, toolIds: string[]): Promise<void> {
    const { metadata, tools } = await this.getProjectAllowedTools(projectId);
    await this.updateProject(projectId, {
      metadata: { ...metadata, allowedTools: Array.from(new Set([...tools, ...toolIds])) },
    });
  }

  public async removeToolsFromProject(projectId: string, toolIds: string[]): Promise<void> {
    const { metadata, tools } = await this.getProjectAllowedTools(projectId);
    await this.updateProject(projectId, {
      metadata: { ...metadata, allowedTools: tools.filter((id) => !toolIds.includes(id)) },
    });
  }

  public async checkProjectPermission(
    projectId: string,
    userId: string,
    requiredRole?: string
  ): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2 LIMIT 1`,
      [projectId, userId]
    );

    if (result.rows.length === 0) return false;

    if (!requiredRole) return true;

    const roleHierarchy: Record<string, number> = {
      viewer: 1,
      member: 2,
      admin: 3,
      owner: 4,
    };

    const memberRole: string = result.rows[0].role;
    return (roleHierarchy[memberRole] ?? 0) >= (roleHierarchy[requiredRole] ?? 0);
  }

  public async createBulkProjects(
    projects: Array<{
      name: string;
      description?: string;
      ownerId: string;
      type?: string;
    }>
  ): Promise<Record<string, unknown>[]> {
    const results: Record<string, unknown>[] = [];

    for (const projectData of projects) {
      const project = await this.createProject(projectData);
      results.push(project);
    }

    return results;
  }

  public async archiveCompletedProjects(days: number = 90): Promise<number> {
    const pool = getControlPool();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await pool.query(
      `UPDATE projects SET status = 'archived', updated_at = NOW()
       WHERE status = 'completed' AND updated_at < $1`,
      [cutoffDate]
    );

    return result.rowCount ?? 0;
  }
}
