/**
 * Persona Management API Client
 * Handles all persona-related operations
 */

import { coreClient, edenWithCSRFRetry, edenRequest } from './eden';
import type {
  Persona,
  PersonaAnalytics,
  PersonaValidation,
  PersonaRecommendation,
  PersonaTemplate,
} from '@uaip/contracts/api';
import type {
  PersonaCreate,
  PersonaUpdate,
  PersonaSearchRequest,
  PersonaListOptions,
} from '@uaip/contracts/api';

export type { PersonaCreate, PersonaUpdate, PersonaSearchRequest, PersonaListOptions };

const personaRoute = coreClient.api.v1.personas;

export const personasAPI = {
  async list(options?: PersonaListOptions): Promise<Persona[]> {
    return edenWithCSRFRetry(() => personaRoute.get({ query: options }));
  },

  async get(id: string): Promise<Persona> {
    return edenWithCSRFRetry(() => personaRoute[id].get());
  },

  async create(persona: PersonaCreate): Promise<Persona> {
    return edenWithCSRFRetry(() => personaRoute.post(persona));
  },

  async update(id: string, updates: PersonaUpdate): Promise<Persona> {
    return edenWithCSRFRetry(() => personaRoute[id].put(updates));
  },

  async delete(id: string): Promise<void> {
    await edenWithCSRFRetry(() => personaRoute[id].delete());
  },

  async search(request: PersonaSearchRequest): Promise<Persona[]> {
    return edenWithCSRFRetry(() => personaRoute.search.get({ query: request }));
  },

  async getRecommendations(context?: unknown): Promise<PersonaRecommendation[]> {
    return edenWithCSRFRetry(() => personaRoute.recommendations.post({ context }));
  },

  async getTemplates(): Promise<PersonaTemplate[]> {
    return edenWithCSRFRetry(() => personaRoute.templates.get());
  },

  async createFromTemplate(
    templateId: string,
    overrides?: Partial<PersonaCreate>
  ): Promise<Persona> {
    return edenWithCSRFRetry(() => personaRoute.templates[templateId].apply.post(overrides));
  },

  async getAnalytics(id: string, days: number = 30): Promise<PersonaAnalytics> {
    return edenWithCSRFRetry(() => personaRoute[id].analytics.get({ query: { days } }));
  },

  async validate(persona: PersonaCreate | PersonaUpdate): Promise<PersonaValidation> {
    return edenWithCSRFRetry(() => personaRoute.validate.post(persona));
  },

  async clone(id: string, name: string): Promise<Persona> {
    return edenWithCSRFRetry(() => personaRoute[id].clone.post({ name }));
  },

  async activate(id: string): Promise<Persona> {
    return edenWithCSRFRetry(() => personaRoute[id].activate.post());
  },

  async deactivate(id: string): Promise<Persona> {
    return edenWithCSRFRetry(() => personaRoute[id].deactivate.post());
  },

  async getAgents(personaId: string): Promise<unknown[]> {
    return edenWithCSRFRetry(() => personaRoute[personaId].agents.get());
  },

  async bulkCreate(personas: PersonaCreate[]): Promise<Persona[]> {
    return edenWithCSRFRetry(() => personaRoute.bulk.post({ personas }));
  },

  async export(format: 'json' | 'yaml' = 'json'): Promise<Blob> {
    return edenRequest<Blob>(`/api/v1/personas/export?format=${encodeURIComponent(format)}`, {
      method: 'GET',
      responseType: 'blob',
    });
  },

  async import(file: File): Promise<{ imported: number; errors?: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    return edenRequest('/api/v1/personas/import', {
      method: 'POST',
      body: formData,
    });
  },

  async getForDisplay(options?: PersonaListOptions): Promise<Persona[]> {
    return edenWithCSRFRetry(() => personaRoute.display.get({ query: options }));
  },
};
