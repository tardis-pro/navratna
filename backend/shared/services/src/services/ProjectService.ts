import { Repository, In } from 'typeorm';
import { createLogger } from '@uaip/utils';
import { TypeOrmService } from '../typeormService.js';
import { ProjectEntity, ProjectStatus, ProjectVisibility } from '../entities/project.entity.js';
import { ProjectMemberEntity, ProjectRole } from '../entities/project-member.entity.js';
import { ProjectFileEntity, FileType, FileStatus } from '../entities/project-file.entity.js';

const logger = createLogger({
  serviceName: 'project-service',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export class ProjectService {
  private static instance: ProjectService;
  private typeormService: TypeOrmService;

  // Repositories
  private projectRepository: Repository<ProjectEntity> | null = null;
  private projectMemberRepository: Repository<ProjectMemberEntity> | null = null;
  private projectFileRepository: Repository<ProjectFileEntity> | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  public static getInstance(): ProjectService {
    if (!ProjectService.instance) {
      ProjectService.instance = new ProjectService();
    }
    return ProjectService.instance;
  }

  // Repository getters with lazy initialization
  public getProjectRepository(): Repository<ProjectEntity> {
    if (!this.projectRepository) {
      this.projectRepository = this.typeormService.getDataSource().getRepository(ProjectEntity);
    }
    return this.projectRepository;
  }

  public getProjectMemberRepository(): Repository<ProjectMemberEntity> {
    if (!this.projectMemberRepository) {
      this.projectMemberRepository = this.typeormService
        .getDataSource()
        .getRepository(ProjectMemberEntity);
    }
    return this.projectMemberRepository;
  }

  public getProjectFileRepository(): Repository<ProjectFileEntity> {
    if (!this.projectFileRepository) {
      this.projectFileRepository = this.typeormService
        .getDataSource()
        .getRepository(ProjectFileEntity);
    }
    return this.projectFileRepository;
  }

  // Project operations
  public async createProject(data: {
    name: string;
    description?: string;
    ownerId: string;
    type?: string;
    visibility?: ProjectVisibility;
    settings?: any;
    metadata?: any;
  }): Promise<ProjectEntity> {
    const projectRepo = this.getProjectRepository();

    // Generate a unique slug for the project
    const slug = await this.generateProjectSlug(data.name);

    const project = projectRepo.create({
      name: data.name,
      description: data.description,
      ownerId: data.ownerId,
      slug: slug,
      status: ProjectStatus.ACTIVE,
      visibility: data.visibility || ProjectVisibility.PRIVATE,
      settings: {
        allowFileUploads: true,
        allowArtifactGeneration: true,
        ...data.settings,
      },
      metadata: data.metadata,
    });

    const savedProject = await projectRepo.save(project);

    // Add owner as admin member
    await this.addProjectMember(savedProject.id, data.ownerId, ProjectRole.ADMIN);

    return savedProject;
  }

  public async findProjectById(id: string): Promise<ProjectEntity | null> {
    return await this.getProjectRepository().findOne({
      where: { id },
      relations: ['owner', 'members', 'members.user', 'files'],
    });
  }

  public async findProjectsByOwner(ownerId: string): Promise<ProjectEntity[]> {
    return await this.getProjectRepository().find({
      where: { owner: { id: ownerId } },
      relations: ['members'],
    });
  }

  public async findProjectsByMember(userId: string): Promise<ProjectEntity[]> {
    const memberRepo = this.getProjectMemberRepository();
    const memberships = await memberRepo.find({
      where: { user: { id: userId } },
      relations: ['project', 'project.owner'],
    });

    return memberships.map((m) => m.project);
  }

  public async updateProject(
    id: string,
    data: Partial<ProjectEntity>
  ): Promise<ProjectEntity | null> {
    await this.getProjectRepository().update(id, data);
    return await this.findProjectById(id);
  }

  public async updateProjectStatus(id: string, status: ProjectStatus): Promise<boolean> {
    const result = await this.getProjectRepository().update(id, { status });
    return result.affected !== 0;
  }

  public async deleteProject(id: string): Promise<boolean> {
    const result = await this.getProjectRepository().delete(id);
    return result.affected !== 0;
  }

  // Project member operations
  public async addProjectMember(
    projectId: string,
    userId: string,
    role: ProjectRole = ProjectRole.MEMBER
  ): Promise<ProjectMemberEntity> {
    const memberRepo = this.getProjectMemberRepository();

    // Check if already a member
    const existing = await memberRepo.findOne({
      where: { project: { id: projectId }, user: { id: userId } },
    });

    if (existing) {
      // Update role if different
      if (existing.role !== role) {
        await memberRepo.update(existing.id, { role });
        existing.role = role;
      }
      return existing;
    }

    // Create new membership
    const member = memberRepo.create({
      project: { id: projectId },
      user: { id: userId },
      role,
    });

    return await memberRepo.save(member);
  }

  public async removeProjectMember(projectId: string, userId: string): Promise<boolean> {
    const result = await this.getProjectMemberRepository().delete({
      project: { id: projectId },
      user: { id: userId },
    });
    return result.affected !== 0;
  }

  public async updateMemberRole(
    projectId: string,
    userId: string,
    role: ProjectRole
  ): Promise<boolean> {
    const result = await this.getProjectMemberRepository().update(
      { project: { id: projectId }, user: { id: userId } },
      { role }
    );
    return result.affected !== 0;
  }

  public async getProjectMembers(projectId: string): Promise<ProjectMemberEntity[]> {
    return await this.getProjectMemberRepository().find({
      where: { project: { id: projectId } },
      relations: ['user'],
    });
  }

  // Project file operations
  public async addProjectFile(data: {
    projectId: string;
    uploadedById: string;
    path: string;
    type?: string;
    size?: number;
    mimeType?: string;
    metadata?: any;
  }): Promise<ProjectFileEntity> {
    const fileRepo = this.getProjectFileRepository();
    const file = fileRepo.create({
      projectId: data.projectId,
      uploadedById: data.uploadedById,
      name: data.path.split('/').pop() || 'unnamed',
      path: data.path,
      type: data.type ? (data.type as FileType) : FileType.OTHER,
      size: data.size || 0,
      mimeType: data.mimeType,
    });

    return await fileRepo.save(file);
  }

  public async updateProjectFile(
    id: string,
    data: {
      name?: string;
      description?: string;
      url?: string;
      size?: number;
      mimeType?: string;
      status?: FileStatus;
    }
  ): Promise<ProjectFileEntity | null> {
    await this.getProjectFileRepository().update(id, data);
    return await this.getProjectFileRepository().findOne({ where: { id } });
  }

  public async deleteProjectFile(id: string): Promise<boolean> {
    const result = await this.getProjectFileRepository().delete(id);
    return result.affected !== 0;
  }

  public async getProjectFiles(projectId: string): Promise<ProjectFileEntity[]> {
    return await this.getProjectFileRepository().find({
      where: { project: { id: projectId } },
      order: { path: 'ASC' },
    });
  }

  // Tool assignment operations
  public async assignToolsToProject(projectId: string, toolIds: string[]): Promise<void> {
    const project = await this.findProjectById(projectId);
    if (!project) throw new Error('Project not found');

    // Store tool assignments in metadata for now
    const metadata = project.metadata || {};
    const currentTools = metadata.allowedTools || [];
    const newTools = Array.from(new Set([...currentTools, ...toolIds]));

    await this.updateProject(projectId, {
      metadata: {
        ...metadata,
        allowedTools: newTools,
      },
    });
  }

  public async removeToolsFromProject(projectId: string, toolIds: string[]): Promise<void> {
    const project = await this.findProjectById(projectId);
    if (!project) throw new Error('Project not found');

    const metadata = project.metadata || {};
    const currentTools: string[] = (metadata.allowedTools as string[]) || [];
    const remainingTools = currentTools.filter((id: string) => !toolIds.includes(id));

    await this.updateProject(projectId, {
      metadata: {
        ...metadata,
        allowedTools: remainingTools,
      },
    });
  }

  // Permission checks
  public async checkProjectPermission(
    projectId: string,
    userId: string,
    requiredRole?: ProjectRole
  ): Promise<boolean> {
    const member = await this.getProjectMemberRepository().findOne({
      where: { project: { id: projectId }, user: { id: userId } },
    });

    if (!member) return false;

    if (!requiredRole) return true;

    const roleHierarchy: Record<ProjectRole, number> = {
      [ProjectRole.VIEWER]: 1,
      [ProjectRole.MEMBER]: 2,
      [ProjectRole.ADMIN]: 3,
      [ProjectRole.OWNER]: 4,
    };

    return roleHierarchy[member.role] >= roleHierarchy[requiredRole];
  }

  // Bulk operations
  public async createBulkProjects(
    projects: Array<{
      name: string;
      description?: string;
      ownerId: string;
      type?: string;
    }>
  ): Promise<ProjectEntity[]> {
    const projectRepo = this.getProjectRepository();
    const entities = projects.map((project) =>
      projectRepo.create({
        name: project.name,
        description: project.description,
        ownerId: project.ownerId,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.PRIVATE,
      })
    );

    const savedProjects = await projectRepo.save(entities);

    // Add owners as admin members
    const memberPromises = savedProjects.map((project) =>
      this.addProjectMember(project.id, project.ownerId, ProjectRole.ADMIN)
    );
    await Promise.all(memberPromises);

    return savedProjects;
  }

  public async archiveCompletedProjects(days: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.getProjectRepository()
      .createQueryBuilder()
      .update(ProjectEntity)
      .set({ status: ProjectStatus.ARCHIVED })
      .where('status = :status', { status: ProjectStatus.COMPLETED })
      .andWhere('updatedAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }

  // Helper method to generate unique project slug
  private async generateProjectSlug(name: string): Promise<string> {
    // Create base slug from name
    const baseSlug = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 6);

    // Add random suffix to ensure uniqueness
    const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    const slug = `${baseSlug}${suffix}`;

    // Check if slug already exists
    const existing = await this.getProjectRepository().findOne({ where: { slug } });
    if (existing) {
      // Recursively try again with new random suffix
      return this.generateProjectSlug(name);
    }

    return slug;
  }
}
