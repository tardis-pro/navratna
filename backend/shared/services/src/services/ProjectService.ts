import { Repository, In } from 'typeorm';
import { logger } from '@uaip/utils/logger';
import { TypeOrmService } from '../typeormService';
import { Project } from '../entities/project.entity';
import { ProjectMember } from '../entities/project-member.entity';
import { ProjectFile } from '../entities/project-file.entity';
import { ProjectStatus, ProjectMemberRole } from '@uaip/types/project';

export class ProjectService {
  private static instance: ProjectService;
  private typeormService: TypeOrmService;
  
  // Repositories
  private projectRepository: Repository<Project> | null = null;
  private projectMemberRepository: Repository<ProjectMember> | null = null;
  private projectFileRepository: Repository<ProjectFile> | null = null;

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
  public getProjectRepository(): Repository<Project> {
    if (!this.projectRepository) {
      this.projectRepository = this.typeormService.dataSource.getRepository(Project);
    }
    return this.projectRepository;
  }

  public getProjectMemberRepository(): Repository<ProjectMember> {
    if (!this.projectMemberRepository) {
      this.projectMemberRepository = this.typeormService.dataSource.getRepository(ProjectMember);
    }
    return this.projectMemberRepository;
  }

  public getProjectFileRepository(): Repository<ProjectFile> {
    if (!this.projectFileRepository) {
      this.projectFileRepository = this.typeormService.dataSource.getRepository(ProjectFile);
    }
    return this.projectFileRepository;
  }

  // Project operations
  public async createProject(data: {
    name: string;
    description?: string;
    ownerId: string;
    type?: string;
    visibility?: 'public' | 'private' | 'internal';
    settings?: any;
    metadata?: any;
  }): Promise<Project> {
    const projectRepo = this.getProjectRepository();
    const project = projectRepo.create({
      ...data,
      owner: { id: data.ownerId },
      status: ProjectStatus.PLANNING,
      visibility: data.visibility || 'private',
      settings: {
        allowedTools: [],
        enabledFeatures: [],
        ...data.settings
      }
    });

    const savedProject = await projectRepo.save(project);

    // Add owner as admin member
    await this.addProjectMember(savedProject.id, data.ownerId, ProjectMemberRole.ADMIN);

    return savedProject;
  }

  public async findProjectById(id: string): Promise<Project | null> {
    return await this.getProjectRepository().findOne({
      where: { id },
      relations: ['owner', 'members', 'members.user', 'files']
    });
  }

  public async findProjectsByOwner(ownerId: string): Promise<Project[]> {
    return await this.getProjectRepository().find({
      where: { owner: { id: ownerId } },
      relations: ['members']
    });
  }

  public async findProjectsByMember(userId: string): Promise<Project[]> {
    const memberRepo = this.getProjectMemberRepository();
    const memberships = await memberRepo.find({
      where: { user: { id: userId } },
      relations: ['project', 'project.owner']
    });

    return memberships.map(m => m.project);
  }

  public async updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
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
    role: ProjectMemberRole = ProjectMemberRole.MEMBER
  ): Promise<ProjectMember> {
    const memberRepo = this.getProjectMemberRepository();
    
    // Check if already a member
    const existing = await memberRepo.findOne({
      where: { project: { id: projectId }, user: { id: userId } }
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
      role
    });

    return await memberRepo.save(member);
  }

  public async removeProjectMember(projectId: string, userId: string): Promise<boolean> {
    const result = await this.getProjectMemberRepository().delete({
      project: { id: projectId },
      user: { id: userId }
    });
    return result.affected !== 0;
  }

  public async updateMemberRole(
    projectId: string, 
    userId: string, 
    role: ProjectMemberRole
  ): Promise<boolean> {
    const result = await this.getProjectMemberRepository().update(
      { project: { id: projectId }, user: { id: userId } },
      { role }
    );
    return result.affected !== 0;
  }

  public async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return await this.getProjectMemberRepository().find({
      where: { project: { id: projectId } },
      relations: ['user']
    });
  }

  // Project file operations
  public async addProjectFile(data: {
    projectId: string;
    path: string;
    content?: string;
    type?: string;
    metadata?: any;
  }): Promise<ProjectFile> {
    const fileRepo = this.getProjectFileRepository();
    const file = fileRepo.create({
      project: { id: data.projectId },
      path: data.path,
      content: data.content,
      type: data.type || 'unknown',
      metadata: data.metadata
    });

    return await fileRepo.save(file);
  }

  public async updateProjectFile(id: string, data: {
    content?: string;
    metadata?: any;
  }): Promise<ProjectFile | null> {
    await this.getProjectFileRepository().update(id, data);
    return await this.getProjectFileRepository().findOne({ where: { id } });
  }

  public async deleteProjectFile(id: string): Promise<boolean> {
    const result = await this.getProjectFileRepository().delete(id);
    return result.affected !== 0;
  }

  public async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    return await this.getProjectFileRepository().find({
      where: { project: { id: projectId } },
      order: { path: 'ASC' }
    });
  }

  // Tool assignment operations
  public async assignToolsToProject(projectId: string, toolIds: string[]): Promise<void> {
    const project = await this.findProjectById(projectId);
    if (!project) throw new Error('Project not found');

    const currentTools = project.settings?.allowedTools || [];
    const newTools = Array.from(new Set([...currentTools, ...toolIds]));

    await this.updateProject(projectId, {
      settings: {
        ...project.settings,
        allowedTools: newTools
      }
    });
  }

  public async removeToolsFromProject(projectId: string, toolIds: string[]): Promise<void> {
    const project = await this.findProjectById(projectId);
    if (!project) throw new Error('Project not found');

    const currentTools = project.settings?.allowedTools || [];
    const remainingTools = currentTools.filter(id => !toolIds.includes(id));

    await this.updateProject(projectId, {
      settings: {
        ...project.settings,
        allowedTools: remainingTools
      }
    });
  }

  // Permission checks
  public async checkProjectPermission(
    projectId: string, 
    userId: string, 
    requiredRole?: ProjectMemberRole
  ): Promise<boolean> {
    const member = await this.getProjectMemberRepository().findOne({
      where: { project: { id: projectId }, user: { id: userId } }
    });

    if (!member) return false;

    if (!requiredRole) return true;

    const roleHierarchy: Record<ProjectMemberRole, number> = {
      [ProjectMemberRole.VIEWER]: 1,
      [ProjectMemberRole.MEMBER]: 2,
      [ProjectMemberRole.ADMIN]: 3
    };

    return roleHierarchy[member.role] >= roleHierarchy[requiredRole];
  }

  // Bulk operations
  public async createBulkProjects(projects: Array<{
    name: string;
    description?: string;
    ownerId: string;
    type?: string;
  }>): Promise<Project[]> {
    const projectRepo = this.getProjectRepository();
    const entities = projects.map(project => projectRepo.create({
      ...project,
      owner: { id: project.ownerId },
      status: ProjectStatus.PLANNING,
      visibility: 'private'
    }));

    const savedProjects = await projectRepo.save(entities);

    // Add owners as admin members
    const memberPromises = savedProjects.map(project => 
      this.addProjectMember(project.id, project.owner.id, ProjectMemberRole.ADMIN)
    );
    await Promise.all(memberPromises);

    return savedProjects;
  }

  public async archiveCompletedProjects(days: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.getProjectRepository()
      .createQueryBuilder()
      .update(Project)
      .set({ status: ProjectStatus.ARCHIVED })
      .where('status = :status', { status: ProjectStatus.COMPLETED })
      .andWhere('updatedAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}