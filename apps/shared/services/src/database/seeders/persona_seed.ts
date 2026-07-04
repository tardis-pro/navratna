import { getIntelligenceDb } from '../drizzle/clients/index';
import { personas } from '../../database/drizzle/schemas/intelligence_schema';
import { BaseSeed } from './base_seed';
import {
  getAllPersonasFlatWrapper,
  PersonaStatus,
  PersonaVisibility,
  type Persona,
} from '@uaip/types';
import type { InferInsertModel } from 'drizzle-orm';

type PersonaInsert = InferInsertModel<typeof personas>;
type PersonaDbSelect = typeof personas.$inferSelect;

export class PersonaSeed extends BaseSeed {
  private db = getIntelligenceDb();
  private users: { id: string }[] = [];

  constructor(userIds: string[]) {
    super('Personas');
    this.users = userIds.map((id) => ({ id }));
  }

  async seed(): Promise<PersonaDbSelect[]> {
    const seedData = await this.getSeedData();

    for (const persona of seedData) {
      await this.db
        .insert(personas)
        .values(persona)
        .onConflictDoNothing();
    }

    return await this.db.select().from(personas);
  }

  async getSeedData(): Promise<PersonaInsert[]> {
    const allPersonasFlat: Persona[] = getAllPersonasFlatWrapper();

    return allPersonasFlat.map((persona: Persona, index: number) => {
      const record: PersonaInsert = {
        name: persona.name,
        role: persona.role,
        description: persona.description,
        background: persona.background,
        systemPrompt: persona.systemPrompt,
        traits: persona.traits || [],
        expertise: persona.expertise?.map((e) => e.name) || [],
        conversationalStyle: persona.conversationalStyle,
        status: persona.status ?? PersonaStatus.DRAFT,
        visibility: persona.visibility ?? PersonaVisibility.PRIVATE,
        createdBy:
          this.users[index % this.users.length]?.id || '00000000-0000-0000-0000-000000000000',
        organizationId: persona.organizationId || '00000000-0000-0000-0000-000000000001',
        teamId: persona.teamId || null,
        version: persona.version || 1,
        parentPersonaId: persona.parentPersonaId || null,
        tags: persona.tags || [],
        validation: persona.validation || null,
        usageStats: persona.usageStats || null,
        configuration: persona.configuration || {
          maxTokens: 4000,
          temperature: 0.7,
          topP: 0.9,
          frequencyPenalty: 0,
          presencePenalty: 0,
          stopSequences: [],
        },
        capabilities: persona.capabilities || [],
        restrictions: persona.restrictions || {
          allowedTopics: [],
          forbiddenTopics: [],
          requiresApproval: false,
        },
        totalInteractions: 0,
        successfulInteractions: 0,
        qualityScore: null,
        consistencyScore: null,
        userSatisfaction: null,
        lastUsedAt: null,
        lastUpdatedBy: null,
        tone: null,
        style: null,
        energyLevel: null,
        chattiness: null,
        empathyLevel: null,
        parentPersonas: null,
        hybridTraits: null,
        dominantExpertise: persona.expertise?.[0]?.name || null,
        personalityBlend: null,
        createdAt: persona.createdAt || new Date(),
        updatedAt: persona.updatedAt || new Date(),
        metadata: persona.metadata || {},
      };
      return record;
    });
  }
}
