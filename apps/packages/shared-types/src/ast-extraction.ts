import type { EnvVarSchema, ServiceDefinition } from './repo-context';

export type ExtractedSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'enum';

export interface SymbolInfo {
  name: string;
  file: string;
  startLine: number;
  line: number;
  kind: ExtractedSymbolKind;
}

export interface ImportInfo {
  file: string;
  source: string;
  symbols: string[];
}

export interface AstExtractionResult {
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  fileCount: number;
}

export interface ImportEdge {
  from: string;
  to: string;
  symbols: string[];
}

export interface RepoDocument {
  file: string;
  content: string;
}

export interface StructuralAnalysis {
  scripts: Record<string, string>;
  services: ServiceDefinition[];
  ports: number[];
  envVars: EnvVarSchema[];
  docs: RepoDocument[];
}

export interface OperationalAnalysis {
  scripts: Record<string, string>;
  commitFormat?: string;
  techDebt: string[];
  makeTargets: string[];
}
