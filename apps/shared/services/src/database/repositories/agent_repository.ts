import { eq, desc, and, inArray } from 'drizzle-orm';
import { getIntelligenceDb } from '../drizzle/clients/index';
import {
  agents,
  personas,
  type Agent as AgentRow,
  type NewAgent,
  type Persona as PersonaRow,
  type NewPersona,
} from '../drizzle/schemas/intelligence_schema';
import { logger } from '@uaip/utils';

export class AgentRepository {
  private get db() {
    return getIntelligenceDb();
  }

  async findById(id: string): Promise<AgentRow | null> {
    try {
      const [row] = await this.db.select().from(agents).where(eq(agents.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('AgentRepository.findById failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async findMany(conditions: Partial<{ isActive: boolean; role: string; status: string }> = {}): Promise<AgentRow[]> {
    try {
      const clauses = [];
      if (conditions.isActive !== undefined) clauses.push(eq(agents.isActive, conditions.isActive));
      if (conditions.role !== undefined) clauses.push(eq(agents.role, conditions.role as AgentRow['role']));
      if (conditions.status !== undefined) clauses.push(eq(agents.status, conditions.status));
      const query = this.db.select().from(agents);
      return clauses.length > 0
        ? query.where(and(...(clauses as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])))
        : query.orderBy(desc(agents.createdAt));
    } catch (error) {
      logger.error('AgentRepository.findMany failed', { error: (error as Error).message });
      throw error;
    }
  }

  async createAgent(data: NewAgent): Promise<AgentRow> {
    try {
      const [row] = await this.db.insert(agents).values(data).returning();
      return row;
    } catch (error) {
      logger.error('AgentRepository.createAgent failed', { error: (error as Error).message });
      throw error;
    }
  }

  async updateAgent(id: string, data: Partial<NewAgent>): Promise<AgentRow | null> {
    try {
      const [row] = await this.db.update(agents).set(data).where(eq(agents.id, id)).returning();
      return row ?? null;
    } catch (error) {
      logger.error('AgentRepository.updateAgent failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async deleteAgent(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(agents).where(eq(agents.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error('AgentRepository.deleteAgent failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async count(): Promise<number> {
    try {
      const result = await this.db.select({ count: agents.id }).from(agents);
      return result.length;
    } catch (error) {
      logger.error('AgentRepository.count failed', { error: (error as Error).message });
      throw error;
    }
  }
}

export class PersonaRepository {
  private get db() {
    return getIntelligenceDb();
  }

  async findById(id: string): Promise<PersonaRow | null> {
    try {
      const [row] = await this.db.select().from(personas).where(eq(personas.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('PersonaRepository.findById failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async findAll(options: { limit?: number; offset?: number } = {}): Promise<PersonaRow[]> {
    try {
      return this.db
        .select()
        .from(personas)
        .orderBy(desc(personas.createdAt))
        .limit(options.limit ?? 100)
        .offset(options.offset ?? 0);
    } catch (error) {
      logger.error('PersonaRepository.findAll failed', { error: (error as Error).message });
      throw error;
    }
  }

  async search(query: string, options: { limit?: number; offset?: number } = {}): Promise<PersonaRow[]> {
    try {
      const { ilike, or } = await import('drizzle-orm');
      const pattern = `%${query}%`;
      return this.db
        .select()
        .from(personas)
        .where(or(ilike(personas.name, pattern), ilike(personas.description, pattern)))
        .orderBy(desc(personas.createdAt))
        .limit(options.limit ?? 50)
        .offset(options.offset ?? 0);
    } catch (error) {
      logger.error('PersonaRepository.search failed', { error: (error as Error).message });
      throw error;
    }
  }

  async createPersona(data: NewPersona): Promise<PersonaRow> {
    try {
      const [row] = await this.db.insert(personas).values(data).returning();
      return row;
    } catch (error) {
      logger.error('PersonaRepository.createPersona failed', { error: (error as Error).message });
      throw error;
    }
  }

  async updatePersona(id: string, data: Partial<NewPersona>): Promise<PersonaRow | null> {
    try {
      const [row] = await this.db.update(personas).set(data).where(eq(personas.id, id)).returning();
      return row ?? null;
    } catch (error) {
      logger.error('PersonaRepository.updatePersona failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async deletePersona(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(personas).where(eq(personas.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error('PersonaRepository.deletePersona failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async findByCreator(createdBy: string): Promise<PersonaRow[]> {
    try {
      return this.db.select().from(personas).where(eq(personas.createdBy, createdBy)).orderBy(desc(personas.createdAt));
    } catch (error) {
      logger.error('PersonaRepository.findByCreator failed', { error: (error as Error).message });
      throw error;
    }
  }

  async getOrCreateDefaultPersona(): Promise<PersonaRow> {
    try {
      const existing = await this.db.select().from(personas).where(eq(personas.name, 'Default Persona')).limit(1);
      if (existing[0]) return existing[0];
      const [created] = await this.db.insert(personas).values({
        name: 'Default Persona',
        role: 'Assistant',
        description: 'A helpful AI assistant',
        background: 'AI assistant background',
        systemPrompt: 'You are a helpful AI assistant.',
        traits: [],
        expertise: [],
        status: 'active',
        visibility: 'private',
        createdBy: 'system',
        version: 1,
        tags: [],
        capabilities: [],
      }).returning();
      return created;
    } catch (error) {
      logger.error('PersonaRepository.getOrCreateDefaultPersona failed', { error: (error as Error).message });
      throw error;
    }
  }
}
