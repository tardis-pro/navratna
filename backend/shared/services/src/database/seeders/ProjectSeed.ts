import { DataSource, DeepPartial } from 'typeorm';
import { BaseSeed } from './BaseSeed.js';
import { ProjectEntity, ProjectStatus, ProjectVisibility } from '../../entities/project.entity.js';
import { UserEntity } from '../../entities/user.entity.js';
import { Agent } from '../../entities/agent.entity.js';
import { ProjectType } from '@uaip/types';

/**
 * Project seeder with diverse project types and agent recommendations
 */
export class ProjectSeed extends BaseSeed<ProjectEntity> {
  private users: UserEntity[] = [];
  private agents: Agent[] = [];

  constructor(dataSource: DataSource, users: UserEntity[], agents: Agent[]) {
    super(dataSource, dataSource.getRepository(ProjectEntity), 'Projects');
    this.users = users;
    this.agents = agents;
  }

  getUniqueField(): keyof ProjectEntity {
    return 'slug';
  }

  private getAgentIdsByRole(roles: string[]): string[] {
    return this.agents
      .filter(agent => roles.some(role => 
        agent.name.toLowerCase().includes(role.toLowerCase()) ||
        agent.legacyPersona?.name?.toLowerCase().includes(role.toLowerCase())
      ))
      .map(agent => agent.id)
      .slice(0, 3); // Limit to 3 recommended agents per project
  }

  private generateSlug(): string {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  async getSeedData(): Promise<DeepPartial<ProjectEntity>[]> {
    const adminUser = this.users.find(u => u.email === 'admin@uaip.dev') || this.users[0];
    const devUser = this.users.find(u => u.email === 'developer@uaip.dev') || this.users[1];
    const analystUser = this.users.find(u => u.email === 'analyst@uaip.dev') || this.users[2];
    const designerUser = this.users.find(u => u.email === 'designer@uaip.dev') || this.users[0];

    return [
      // Software Development Projects
      {
        name: 'E-commerce Platform Redesign',
        description: 'Complete overhaul of the existing e-commerce platform with modern architecture and improved UX',
        type: ProjectType.SOFTWARE_DEVELOPMENT,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.TEAM,
        ownerId: devUser.id,
        slug: this.generateSlug(),
        color: '#3B82F6',
        tags: ['react', 'typescript', 'microservices', 'aws'],
        recommendedAgents: this.getAgentIdsByRole(['tech-lead', 'software-engineer', 'qa-engineer']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 50 * 1024 * 1024, // 50MB
          allowedFileTypes: ['.js', '.ts', '.json', '.md', '.yml'],
          requireApprovalForArtifacts: false,
          allowedTools: ['git', 'docker', 'jest', 'eslint']
        },
        lastActivityAt: new Date(),
        fileCount: 45,
        artifactCount: 12
      },
      {
        name: 'Mobile Banking App',
        description: 'Development of a secure mobile banking application with biometric authentication',
        type: ProjectType.MOBILE_DEVELOPMENT,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.PRIVATE,
        ownerId: devUser.id,
        slug: this.generateSlug(),
        color: '#10B981',
        tags: ['react-native', 'security', 'fintech', 'biometrics'],
        recommendedAgents: this.getAgentIdsByRole(['mobile-developer', 'security-engineer', 'qa-engineer']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 30 * 1024 * 1024,
          allowedFileTypes: ['.js', '.tsx', '.json', '.md'],
          requireApprovalForArtifacts: true,
          allowedTools: ['react-native', 'expo', 'firebase', 'jest']
        },
        lastActivityAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        fileCount: 78,
        artifactCount: 8
      },
      
      // Business Projects
      {
        name: 'Market Research Analysis',
        description: 'Comprehensive market analysis for new product launch in the SaaS space',
        type: ProjectType.BUSINESS_ANALYSIS,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.ORGANIZATION,
        ownerId: analystUser.id,
        slug: this.generateSlug(),
        color: '#8B5CF6',
        tags: ['market-research', 'saas', 'competitive-analysis'],
        recommendedAgents: this.getAgentIdsByRole(['business-analyst', 'market-researcher', 'data-analyst']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 100 * 1024 * 1024, // 100MB for data files
          allowedFileTypes: ['.xlsx', '.csv', '.pdf', '.pptx', '.md'],
          requireApprovalForArtifacts: false,
          allowedTools: ['excel', 'tableau', 'surveygizmo']
        },
        lastActivityAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        fileCount: 23,
        artifactCount: 5
      },
      {
        name: 'Product Roadmap Q2 2025',
        description: 'Strategic planning and roadmap development for Q2 2025 product initiatives',
        type: ProjectType.PRODUCT_MANAGEMENT,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.TEAM,
        ownerId: adminUser.id,
        slug: this.generateSlug(),
        color: '#F59E0B',
        tags: ['roadmap', 'strategy', 'planning', 'okrs'],
        recommendedAgents: this.getAgentIdsByRole(['product-manager', 'business-analyst', 'project-manager']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 25 * 1024 * 1024,
          allowedFileTypes: ['.md', '.xlsx', '.pdf', '.pptx'],
          requireApprovalForArtifacts: false,
          allowedTools: ['jira', 'confluence', 'miro']
        },
        lastActivityAt: new Date(),
        fileCount: 15,
        artifactCount: 7
      },

      // Creative Projects
      {
        name: 'Brand Identity Refresh',
        description: 'Complete brand identity overhaul including logo, color palette, and brand guidelines',
        type: ProjectType.DESIGN,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.TEAM,
        ownerId: designerUser.id,
        slug: this.generateSlug(),
        color: '#EF4444',
        tags: ['branding', 'design', 'visual-identity'],
        recommendedAgents: this.getAgentIdsByRole(['creative-director', 'designer', 'brand-strategist']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 200 * 1024 * 1024, // 200MB for design files
          allowedFileTypes: ['.psd', '.ai', '.sketch', '.fig', '.png', '.jpg', '.svg'],
          requireApprovalForArtifacts: true,
          allowedTools: ['figma', 'photoshop', 'illustrator']
        },
        lastActivityAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
        fileCount: 67,
        artifactCount: 15
      },
      {
        name: 'Social Media Campaign',
        description: 'Multi-platform social media campaign for product launch with viral content strategy',
        type: ProjectType.CONTENT_CREATION,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.TEAM,
        ownerId: designerUser.id,
        slug: this.generateSlug(),
        color: '#06B6D4',
        tags: ['social-media', 'viral-content', 'marketing'],
        recommendedAgents: this.getAgentIdsByRole(['social-media-manager', 'content-creator', 'viral-gpt']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 100 * 1024 * 1024,
          allowedFileTypes: ['.mp4', '.png', '.jpg', '.gif', '.md', '.txt'],
          requireApprovalForArtifacts: false,
          allowedTools: ['canva', 'hootsuite', 'buffer']
        },
        lastActivityAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        fileCount: 89,
        artifactCount: 25
      },

      // Research Projects
      {
        name: 'AI Ethics Policy Research',
        description: 'Comprehensive research on AI ethics policies and their implementation in enterprise environments',
        type: ProjectType.POLICY_ANALYSIS,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.ORGANIZATION,
        ownerId: analystUser.id,
        slug: this.generateSlug(),
        color: '#7C3AED',
        tags: ['ai-ethics', 'policy', 'governance', 'research'],
        recommendedAgents: this.getAgentIdsByRole(['policy-analyst', 'ethics-researcher', 'legal-advisor']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 50 * 1024 * 1024,
          allowedFileTypes: ['.pdf', '.docx', '.md', '.txt', '.bib'],
          requireApprovalForArtifacts: true,
          allowedTools: ['zotero', 'mendeley', 'latex']
        },
        lastActivityAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
        fileCount: 156,
        artifactCount: 18
      },
      {
        name: 'Customer Behavior Analytics',
        description: 'Deep dive analysis of customer behavior patterns using ML and statistical methods',
        type: ProjectType.DATA_ANALYSIS,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.TEAM,
        ownerId: analystUser.id,
        slug: this.generateSlug(),
        color: '#059669',
        tags: ['analytics', 'machine-learning', 'customer-behavior'],
        recommendedAgents: this.getAgentIdsByRole(['data-scientist', 'statistician', 'business-analyst']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 500 * 1024 * 1024, // 500MB for datasets
          allowedFileTypes: ['.csv', '.json', '.parquet', '.py', '.ipynb', '.r'],
          requireApprovalForArtifacts: false,
          allowedTools: ['jupyter', 'python', 'r', 'tableau', 'sql']
        },
        lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        fileCount: 34,
        artifactCount: 9
      },

      // Specialized Projects
      {
        name: 'Healthcare Data Platform',
        description: 'HIPAA-compliant healthcare data platform for patient record management',
        type: ProjectType.HEALTHCARE,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.PRIVATE,
        ownerId: devUser.id,
        slug: this.generateSlug(),
        color: '#DC2626',
        tags: ['healthcare', 'hipaa', 'data-platform', 'compliance'],
        recommendedAgents: this.getAgentIdsByRole(['healthcare-it', 'compliance-officer', 'security-engineer']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 10 * 1024 * 1024, // Restricted file size for security
          allowedFileTypes: ['.md', '.json', '.yml', '.txt'],
          requireApprovalForArtifacts: true,
          allowedTools: ['docker', 'kubernetes', 'postgresql']
        },
        lastActivityAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
        fileCount: 28,
        artifactCount: 6
      },

      // Collaboration Projects
      {
        name: 'Architecture Review Board',
        description: 'Weekly architecture review sessions for system design decisions and technical debt',
        type: ProjectType.REVIEW,
        status: ProjectStatus.ACTIVE,
        visibility: ProjectVisibility.TEAM,
        ownerId: adminUser.id,
        slug: this.generateSlug(),
        color: '#6366F1',
        tags: ['architecture', 'review', 'technical-debt', 'collaboration'],
        recommendedAgents: this.getAgentIdsByRole(['solutions-architect', 'tech-lead', 'senior-engineer']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 50 * 1024 * 1024,
          allowedFileTypes: ['.md', '.pdf', '.pptx', '.drawio', '.puml'],
          requireApprovalForArtifacts: false,
          allowedTools: ['confluence', 'drawio', 'miro']
        },
        lastActivityAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
        fileCount: 42,
        artifactCount: 11
      },

      // Completed Project Example
      {
        name: 'Legacy System Migration',
        description: 'Successful migration of legacy COBOL systems to modern cloud architecture',
        type: ProjectType.DEVOPS,
        status: ProjectStatus.COMPLETED,
        visibility: ProjectVisibility.ORGANIZATION,
        ownerId: devUser.id,
        slug: this.generateSlug(),
        color: '#64748B',
        tags: ['legacy', 'migration', 'cloud', 'modernization'],
        recommendedAgents: this.getAgentIdsByRole(['migration-specialist', 'devops-engineer', 'code-whisperer']),
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 75 * 1024 * 1024,
          allowedFileTypes: ['.cbl', '.jcl', '.yml', '.tf', '.md'],
          requireApprovalForArtifacts: true,
          allowedTools: ['terraform', 'ansible', 'docker', 'kubernetes']
        },
        lastActivityAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
        completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Completed 5 days ago
        fileCount: 127,
        artifactCount: 23
      }
    ];
  }
}