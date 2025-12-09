import { DataSource, DeepPartial } from 'typeorm';
import { BaseSeed } from './BaseSeed.js';
import { Persona as PersonaEntity } from '../../entities/persona.entity.js';
import { UserEntity } from '../../entities/user.entity.js';
import { Persona, getAllPersonasFlatWrapper, PersonaTone, PersonaStyle, PersonaEnergyLevel } from '@uaip/types';

/**
 * Persona seeder with diverse characteristics
 */
export class PersonaSeed extends BaseSeed<PersonaEntity> {
  private users: UserEntity[] = [];

  constructor(dataSource: DataSource, users: UserEntity[]) {
    super(dataSource, dataSource.getRepository(PersonaEntity), 'Personas');
    this.users = users;
  }

  getUniqueField(): keyof PersonaEntity {
    return 'name';
  }

  async getSeedData(): Promise<DeepPartial<PersonaEntity>[]> {
    // Get all personas as a flat array
    const allPersonasFlat: Persona[] = getAllPersonasFlatWrapper();

    // Convert personas to database entities, assigning createdBy from seeded users
    return allPersonasFlat.map((persona: Persona, index: number) => ({
      name: persona.name,
      role: persona.role,
      description: persona.description,
      background: persona.background,
      systemPrompt: persona.systemPrompt,
      traits: persona.traits,
      expertise: persona.expertise?.map((e) => e.name) || [], // Convert ExpertiseDomain[] to string[]
      conversationalStyle: persona.conversationalStyle,
      status: persona.status,
      visibility: persona.visibility,
      createdBy: this.users[index % this.users.length].id, // Distribute across available users
      organizationId: persona.organizationId,
      teamId: persona.teamId,
      version: persona.version || 1,
      parentPersonaId: persona.parentPersonaId,
      tags: persona.tags || [],
      validation: persona.validation,
      usageStats: persona.usageStats,
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
      // Add missing required properties from PersonaEntity
      totalInteractions: 0,
      successfulInteractions: 0,
      discussionParticipants: [] as any[],
      analytics: [] as any[],
      // Optional properties with defaults
      qualityScore: undefined as number | undefined,
      consistencyScore: undefined as number | undefined,
      userSatisfaction: undefined as number | undefined,
      lastUsedAt: undefined as Date | undefined,
      lastUpdatedBy: undefined as string | undefined,
      // Hybrid persona properties (optional)
      tone: undefined as PersonaTone | undefined,
      style: undefined as PersonaStyle | undefined,
      energyLevel: undefined as PersonaEnergyLevel | undefined,
      chattiness: undefined as number | undefined,
      empathyLevel: undefined as number | undefined,
      parentPersonas: undefined as string[] | undefined,
      hybridTraits: undefined as string[] | undefined,
      dominantExpertise: persona.expertise?.[0]?.name,
      personalityBlend: undefined as Record<string, number> | undefined,

      createdAt: persona.createdAt || new Date(),
      updatedAt: persona.updatedAt || new Date(),
      metadata: persona.metadata || {},
    }));
  }
}
