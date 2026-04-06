import { EventBusService } from '../event_bus_service';
import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';

export async function fetchAgentCapabilitiesViaEventBus(
  eventBus: EventBusService,
  agentId: string,
  timeoutMs = 5_000
): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    const requestId = uuidv4();
    const timeout = setTimeout(() => {
      logger.warn('Agent capabilities request timed out, returning empty', { agentId });
      resolve([]);
    }, timeoutMs);

    eventBus.subscribe(`agent.capabilities.response.${requestId}`, async (event) => {
      clearTimeout(timeout);
      const data: { capabilities?: string[] } = event.data as { capabilities?: string[] };
      resolve(data?.capabilities ?? []);
    });

    eventBus.publish('agent.capabilities.request', { requestId, agentId });
  });
}
