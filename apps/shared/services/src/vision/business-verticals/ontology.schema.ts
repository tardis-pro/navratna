import { z } from 'zod';

export const EntityFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'date', 'json', 'reference']),
  required: z.boolean().default(false),
  referenceTo: z.string().optional(),
});

export const VerticalEntitySchema = z.object({
  name: z.string(),
  uaipPrimitive: z.enum([
    'persona',
    'discussion',
    'artifact',
    'operation',
    'knowledge-item',
    'security-policy',
  ]),
  fields: z.array(EntityFieldSchema),
  searchable: z.boolean().default(true),
});

export const VerticalRelationshipSchema = z.object({
  name: z.string(),
  from: z.string(),
  to: z.string(),
  cardinality: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
});

export const MCPToolDeclarationSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
});

export const VerticalOntologySchema = z.object({
  name: z.string(),
  displayName: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string(),
  entities: z.array(VerticalEntitySchema),
  relationships: z.array(VerticalRelationshipSchema),
  vocabulary: z.record(z.string()),
  mcpTools: z.array(MCPToolDeclarationSchema),
  eventTypes: z.array(z.string()),
});

export type VerticalOntology = z.infer<typeof VerticalOntologySchema>;
export type VerticalEntity = z.infer<typeof VerticalEntitySchema>;
export type VerticalRelationship = z.infer<typeof VerticalRelationshipSchema>;
export type MCPToolDeclaration = z.infer<typeof MCPToolDeclarationSchema>;

export interface OntologyActivation {
  readonly verticalName: string;
  readonly projectId: string;
  readonly activatedAt: Date;
  readonly activatedBy: string;
  readonly ontologyVersion: string;
}

export interface OntologyRegistry {
  activate(verticalName: string, projectId: string, activatedBy: string): Promise<OntologyActivation>;
  deactivate(verticalName: string, projectId: string): Promise<void>;
  listActive(projectId: string): Promise<ReadonlyArray<OntologyActivation>>;
  getOntology(verticalName: string): Promise<VerticalOntology | null>;
  listAvailable(): Promise<ReadonlyArray<VerticalOntology>>;
}
