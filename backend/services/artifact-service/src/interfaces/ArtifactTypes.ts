import { 
  ArtifactGenerationRequest, 
  ArtifactGenerationResponse, 
  ArtifactTemplate, 
  ValidationResult, 
  ArtifactType,
  TemplateFilters,
  GenerationContext
} from '../types/artifact';

export interface IArtifactService {
  // Primary generation method
  generateArtifact(request: ArtifactGenerationRequest): Promise<ArtifactGenerationResponse>;
  
  // Template operations
  listTemplates(type?: ArtifactType): Promise<ArtifactTemplate[]>;
  getTemplate(id: string): Promise<ArtifactTemplate | null>;
  
  // Validation
  validateArtifact(content: string, type: ArtifactType): Promise<ValidationResult>;
}

export interface IArtifactGenerator {
  generate(context: GenerationContext): Promise<string>;
  getSupportedTypes(): ArtifactType[];
}

export interface ITemplateManager {
  selectTemplate(context: GenerationContext): ArtifactTemplate | null;
  applyTemplate(template: ArtifactTemplate, context: GenerationContext): string;
  listTemplates(filters?: TemplateFilters): ArtifactTemplate[];
  getTemplate(id: string): ArtifactTemplate | null;
}

export interface IArtifactValidator {
  validate(content: string, type: ArtifactType): ValidationResult;
} 