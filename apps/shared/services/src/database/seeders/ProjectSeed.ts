import { getControlDb } from '../drizzle/clients/index';
import { projects } from '../../database/drizzle/schemas/control.schema';
import { BaseSeed } from './BaseSeed';

export class ProjectSeed extends BaseSeed {
  private db = getControlDb();
  private users: { id: string }[] = [];

  constructor(userIds: string[], _agentIds: string[]) {
    super('Projects');
    this.users = userIds.map(id => ({ id }));
  }

  async seed(): Promise<any[]> {
    const seedData = await this.getSeedData();

    for (const project of seedData) {
      await this.db.insert(projects).values(project as any).onConflictDoNothing();
    }

    return await this.db.select().from(projects);
  }

  async getSeedData(): Promise<any[]> {
    return [
      {
        name: 'E-commerce Platform Redesign',
        description: 'Complete overhaul of the existing e-commerce platform with modern architecture and improved UX',
        status: 'active',
        type: 'software_development',
        ownerId: this.users[0]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 50 * 1024 * 1024,
          allowedFileTypes: ['.ts', '.tsx', '.json', '.md', '.yml'],
          requireApprovalForArtifacts: false,
          allowedTools: ['git', 'docker', 'jest', 'eslint'],
        },
        metadata: {},
      },
      {
        name: 'Mobile Banking App',
        description: 'Development of a secure mobile banking application with biometric authentication',
        status: 'active',
        type: 'mobile_development',
        ownerId: this.users[0]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 30 * 1024 * 1024,
          allowedFileTypes: ['.ts', '.tsx', '.json', '.md'],
          requireApprovalForArtifacts: true,
          allowedTools: ['react-native', 'expo', 'firebase', 'jest'],
        },
        metadata: {},
      },
      {
        name: 'Market Research Analysis',
        description: 'Comprehensive market analysis for new product launch in the SaaS space',
        status: 'active',
        type: 'business_analysis',
        ownerId: this.users[1]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 100 * 1024 * 1024,
          allowedFileTypes: ['.xlsx', '.csv', '.pdf', '.pptx', '.md'],
          requireApprovalForArtifacts: false,
          allowedTools: ['excel', 'tableau', 'surveygizmo'],
        },
        metadata: {},
      },
      {
        name: 'Product Roadmap Q2 2025',
        description: 'Strategic planning and roadmap development for Q2 2025 product initiatives',
        status: 'active',
        type: 'product_management',
        ownerId: this.users[0]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 25 * 1024 * 1024,
          allowedFileTypes: ['.md', '.xlsx', '.pdf', '.pptx'],
          requireApprovalForArtifacts: false,
          allowedTools: ['jira', 'confluence', 'miro'],
        },
        metadata: {},
      },
      {
        name: 'Brand Identity Refresh',
        description: 'Complete brand identity overhaul including logo, color palette, and brand guidelines',
        status: 'active',
        type: 'design',
        ownerId: this.users[0]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 200 * 1024 * 1024,
          allowedFileTypes: ['.psd', '.ai', '.sketch', '.fig', '.png', '.jpg', '.svg'],
          requireApprovalForArtifacts: true,
          allowedTools: ['figma', 'photoshop', 'illustrator'],
        },
        metadata: {},
      },
      {
        name: 'Social Media Campaign',
        description: 'Multi-platform social media campaign for product launch with viral content strategy',
        status: 'active',
        type: 'content_creation',
        ownerId: this.users[0]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 100 * 1024 * 1024,
          allowedFileTypes: ['.mp4', '.png', '.jpg', '.gif', '.md', '.txt'],
          requireApprovalForArtifacts: false,
          allowedTools: ['canva', 'hootsuite', 'buffer'],
        },
        metadata: {},
      },
      {
        name: 'AI Ethics Policy Research',
        description: 'Comprehensive research on AI ethics policies and their implementation in enterprise environments',
        status: 'active',
        type: 'policy_analysis',
        ownerId: this.users[1]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 50 * 1024 * 1024,
          allowedFileTypes: ['.pdf', '.docx', '.md', '.txt', '.bib'],
          requireApprovalForArtifacts: true,
          allowedTools: ['zotero', 'mendeley', 'latex'],
        },
        metadata: {},
      },
      {
        name: 'Customer Behavior Analytics',
        description: 'Deep dive analysis of customer behavior patterns using ML and statistical methods',
        status: 'active',
        type: 'data_analysis',
        ownerId: this.users[1]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 500 * 1024 * 1024,
          allowedFileTypes: ['.csv', '.json', '.parquet', '.py', '.ipynb', '.r'],
          requireApprovalForArtifacts: false,
          allowedTools: ['jupyter', 'python', 'r', 'tableau', 'sql'],
        },
        metadata: {},
      },
      {
        name: 'Healthcare Data Platform',
        description: 'HIPAA-compliant healthcare data platform for patient record management',
        status: 'active',
        type: 'healthcare',
        ownerId: this.users[0]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 10 * 1024 * 1024,
          allowedFileTypes: ['.md', '.json', '.yml', '.txt'],
          requireApprovalForArtifacts: true,
          allowedTools: ['docker', 'kubernetes', 'postgresql'],
        },
        metadata: {},
      },
      {
        name: 'Architecture Review Board',
        description: 'Weekly architecture review sessions for system design decisions and technical debt',
        status: 'active',
        type: 'review',
        ownerId: this.users[0]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 50 * 1024 * 1024,
          allowedFileTypes: ['.md', '.pdf', '.pptx', '.drawio', '.puml'],
          requireApprovalForArtifacts: false,
          allowedTools: ['confluence', 'drawio', 'miro'],
        },
        metadata: {},
      },
      {
        name: 'Legacy System Migration',
        description: 'Successful migration of legacy COBOL systems to modern cloud architecture',
        status: 'completed',
        type: 'devops',
        ownerId: this.users[0]?.id || '00000000-0000-0000-0000-000000000000',
        settings: {
          allowFileUploads: true,
          allowArtifactGeneration: true,
          maxFileSize: 75 * 1024 * 1024,
          allowedFileTypes: ['.cbl', '.jcl', '.yml', '.tf', '.md'],
          requireApprovalForArtifacts: true,
          allowedTools: ['terraform', 'ansible', 'docker', 'kubernetes'],
        },
        metadata: {},
      },
    ];
  }
}
