import { getIntelligenceDb } from '../drizzle/clients/index';
import { personas } from '../../database/drizzle/schemas/intelligence_schema';
import { BaseSeed } from './base_seed';
import {
  getAllPersonasFlatWrapper,
  type Persona,
  type PersonaStatus,
  type PersonaVisibility,
} from '@uaip/types';
import type { InferInsertModel } from 'drizzle-orm';

type PersonaInsert = InferInsertModel<typeof personas>;

export class PersonaSeed extends BaseSeed {
  private db = getIntelligenceDb();
  private users: { id: string }[] = [];

  constructor(userIds: string[]) {
    super('Personas');
    this.users = userIds.map((id) => ({ id }));
  }

  async seed(): Promise<PersonaInsert[]> {
    const seedData = await this.getSeedData();

    for (const persona of seedData) {
      await this.db
        .insert(personas)
        .values(persona as any)
        .onConflictDoNothing();
    }

    return await this.db.select().from(personas);
  }

  async getSeedData(): Promise<any[]> {
    const allPersonasFlat: Persona[] = getAllPersonasFlatWrapper();

    return allPersonasFlat.map((persona: Persona, index: number) => {
      const record: any = {
        name: persona.name,
        role: persona.role,
        description: persona.description,
        background: persona.background,
        systemPrompt: persona.systemPrompt,
        traits: persona.traits || [],
        expertise: persona.expertise?.map((e) => e.name) || [],
        conversationalStyle: persona.conversationalStyle,
        status: (persona.status || 'draft') as PersonaStatus,
        visibility: (persona.visibility || 'private') as PersonaVisibility,
        createdBy:
          this.users[index % this.users.length]?.id || '00000000-0000-0000-0000-000000000000',
        organizationId: persona.organizationId || null,
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
