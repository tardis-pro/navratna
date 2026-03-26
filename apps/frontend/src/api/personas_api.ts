/**
 * Persona Management API Client
 * Handles all persona-related operations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/api_config';
import type {
  Persona,
  PersonaAnalytics,
  PersonaValidation,
  PersonaRecommendation,
  PersonaTemplate,
} from '@uaip/types';
import type {
  PersonaCreate,
  PersonaUpdate,
  PersonaSearchRequest,
  PersonaListOptions,
} from '@uaip/types';

export type { PersonaCreate, PersonaUpdate, PersonaSearchRequest, PersonaListOptions };

export const personasAPI = {
  async list(options?: PersonaListOptions): Promise<Persona[]> {
    return APIClient.get<Persona[]>(API_ROUTES.PERSONAS.LIST, { params: options });
  },

  async get(id: string): Promise<Persona> {
    return APIClient.get<Persona>(`${API_ROUTES.PERSONAS.GET}/${id}`);
  },

  async create(persona: PersonaCreate): Promise<Persona> {
    return APIClient.post<Persona>(API_ROUTES.PERSONAS.CREATE, persona);
  },

  async update(id: string, updates: PersonaUpdate): Promise<Persona> {
    return APIClient.put<Persona>(`${API_ROUTES.PERSONAS.UPDATE}/${id}`, updates);
  },

  async delete(id: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.PERSONAS.DELETE}/${id}`);
  },

  async search(request: PersonaSearchRequest): Promise<Persona[]> {
    return APIClient.post<Persona[]>(API_ROUTES.PERSONAS.SEARCH, request);
  },

  async getRecommendations(context?: unknown): Promise<PersonaRecommendation[]> {
    return APIClient.post<PersonaRecommendation[]>(API_ROUTES.PERSONAS.RECOMMENDATIONS, {
      context,
    });
  },

  async getTemplates(): Promise<PersonaTemplate[]> {
    return APIClient.get<PersonaTemplate[]>(API_ROUTES.PERSONAS.TEMPLATES);
  },

  async createFromTemplate(
    templateId: string,
    overrides?: Partial<PersonaCreate>
  ): Promise<Persona> {
    return APIClient.post<Persona>(
      `${API_ROUTES.PERSONAS.TEMPLATES}/${templateId}/apply`,
      overrides
    );
  },

  async getAnalytics(id: string, days: number = 30): Promise<PersonaAnalytics> {
    return APIClient.get<PersonaAnalytics>(`${API_ROUTES.PERSONAS.ANALYTICS}/${id}/analytics`, {
      params: { days },
    });
  },

  async validate(persona: PersonaCreate | PersonaUpdate): Promise<PersonaValidation> {
    return APIClient.post<PersonaValidation>(API_ROUTES.PERSONAS.VALIDATE, persona);
  },

  async clone(id: string, name: string): Promise<Persona> {
    return APIClient.post<Persona>(`${API_ROUTES.PERSONAS.GET}/${id}/clone`, { name });
  },

  async activate(id: string): Promise<Persona> {
    return APIClient.post<Persona>(`${API_ROUTES.PERSONAS.UPDATE}/${id}/activate`);
  },

  async deactivate(id: string): Promise<Persona> {
    return APIClient.post<Persona>(`${API_ROUTES.PERSONAS.UPDATE}/${id}/deactivate`);
  },

  async getAgents(personaId: string): Promise<unknown[]> {
    return APIClient.get(`${API_ROUTES.PERSONAS.GET}/${personaId}/agents`);
  },

  async bulkCreate(personas: PersonaCreate[]): Promise<Persona[]> {
    return APIClient.post<Persona[]>(`${API_ROUTES.PERSONAS.CREATE}/bulk`, { personas });
  },

  async export(format: 'json' | 'yaml' = 'json'): Promise<Blob> {
    const response = await APIClient.get(`${API_ROUTES.PERSONAS.LIST}/export`, {
      params: { format },
      responseType: 'blob',
    });
    return response;
  },

  async import(file: File): Promise<{ imported: number; errors?: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    return APIClient.post(`${API_ROUTES.PERSONAS.CREATE}/import`, formData);
  },

  async getForDisplay(options?: PersonaListOptions): Promise<Persona[]> {
    return APIClient.get<Persona[]>('/api/v1/personas/display', { params: options });
  },
};
