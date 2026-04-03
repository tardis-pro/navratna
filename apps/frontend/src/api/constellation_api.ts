import { coreClient, edenWithCSRFRetry } from './eden';
import type { ConstellationRequest, ConstellationResponse } from '@uaip/types';

export const constellationAPI = {
  async getConstellations(request: ConstellationRequest): Promise<ConstellationResponse> {
    return edenWithCSRFRetry(() => coreClient.api.v1.knowledge.constellations.post(request));
  },
};
