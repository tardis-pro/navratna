/**
 * Constellation API Client
 * Handles fetching knowledge constellations from the backend
 */

import { APIClient } from './client';
import type {
  ConstellationRequest,
  ConstellationResponse,
} from '@uaip/types';

const CONSTELLATIONS_ENDPOINT = '/api/v1/knowledge/constellations';

export const constellationAPI = {
  /**
   * Fetch constellations matching the given request parameters.
   * POST /api/v1/knowledge/constellations
   */
  async getConstellations(request: ConstellationRequest): Promise<ConstellationResponse> {
    return APIClient.post<ConstellationResponse>(CONSTELLATIONS_ENDPOINT, request);
  },
};
