import type { BoardConfig } from './board-provider';

export interface ServiceDefinition {
  name: string;
  type: string;
  port?: number;
  description?: string;
  entryPoint?: string;
}

export interface EnvVarSchema {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
  example?: string;
}

export interface RepoContext {
  id: string;
  source: string;
  repoMode: 'brownfield' | 'greenfield';
  services: ServiceDefinition[];
  ports: number[];
  envVars: EnvVarSchema[];
  scripts: Record<string, string>;
  commitFormat?: string;
  techDebt: string[];
  branches: string[];
  boardConfig?: BoardConfig;
  knowledgeItemId?: string;
}
