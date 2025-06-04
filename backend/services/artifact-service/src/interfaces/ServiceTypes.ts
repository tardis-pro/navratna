// Service-specific types for input/output operations

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  generators: {
    [key: string]: boolean;
  };
  templates: {
    total: number;
    byType: { [key: string]: number };
  };
}

export interface GenerationMetrics {
  totalGenerated: number;
  successRate: number;
  averageGenerationTime: number;
  byType: {
    [key: string]: {
      count: number;
      successRate: number;
      averageTime: number;
    };
  };
}

export interface TemplateListResponse {
  success: boolean;
  templates: import('../types/artifact').ArtifactTemplate[];
  total: number;
}

export interface ValidationResponse {
  success: boolean;
  validation: import('../types/artifact').ValidationResult;
} 