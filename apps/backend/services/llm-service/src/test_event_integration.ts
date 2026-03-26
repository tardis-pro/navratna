#!/usr/bin/env tsx

/**
 * Test script to verify LLM event-driven integration
 *
 * This script tests the complete event flow:
 * 1. Publishes llm.agent.generate.request event
 * 2. Waits for llm.agent.generate.response event
 * 3. Validates the response structure
 */

import { EventBusService } from '@uaip/infra/event_bus';
import { logger } from '@uaip/utils';
import type { EventBusMessage } from '@uaip/types';

interface LLMResponseData {
  requestId: string;
  agentId?: string;
  content?: string;
  error?: string;
  confidence?: number;
  model?: string;
}

async function testLLMEventIntegration() {
  logger.info('Starting LLM event integration test...');

  const eventBusService = EventBusService.getInstance(
    {
      serviceName: 'llm-event-test',
    },
    logger
  );

  let responseReceived = false;
  let testResult: Record<string, unknown> | null = null;

  // Subscribe to response events first
  await eventBusService.subscribe('llm.agent.generate.response', async (event: EventBusMessage) => {
    const { requestId, agentId, content, error, confidence, model } = event.data as LLMResponseData;

    logger.info('Received LLM response event', {
      requestId,
      agentId,
      hasContent: !!content,
      hasError: !!error,
      confidence,
      model,
    });

    testResult = {
      success: !error,
      requestId,
      agentId,
      content,
      error,
      confidence,
      model,
      timestamp: new Date().toISOString(),
    };

    responseReceived = true;
  });

  // Give subscription time to register
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Create test request
  const testRequest = {
    requestId: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    agentId: 'test-agent-001',
    messages: [
      {
        id: 'msg_1',
        content: 'Hello, how are you?',
        sender: 'user',
        timestamp: new Date().toISOString(),
        type: 'user' as const,
      },
      {
        id: 'msg_2',
        content: 'I am doing well, thank you for asking!',
        sender: 'assistant',
        timestamp: new Date().toISOString(),
        type: 'assistant' as const,
      },
      {
        id: 'msg_3',
        content: 'What is the capital of France?',
        sender: 'user',
        timestamp: new Date().toISOString(),
        type: 'user' as const,
      },
    ],
    systemPrompt:
      'You are a helpful and knowledgeable AI assistant. Be concise and informative in your responses.',
    maxTokens: 150,
    temperature: 0.7,
    model: 'llama2',
    provider: 'ollama',
  };

  logger.info('Publishing LLM generation request', {
    requestId: testRequest.requestId,
    agentId: testRequest.agentId,
    messageCount: testRequest.messages.length,
  });

  // Publish the test request
  await eventBusService.publish('llm.agent.generate.request', testRequest);

  // Wait for response (timeout after 30 seconds)
  const timeout = 30000;
  const start = Date.now();

  // oxlint-disable-next-line eslint/no-unmodified-loop-condition -- responseReceived is modified by event callback
  while (!responseReceived && Date.now() - start < timeout) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential processing required
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!responseReceived) {
    logger.error('Test failed: No response received within timeout');
    return {
      success: false,
      error: 'Timeout waiting for response',
      duration: timeout,
    };
  }

  const duration = Date.now() - start;
  logger.info('LLM event integration test completed', {
    success: testResult?.success,
    duration,
    hasContent: !!testResult?.content,
    confidence: testResult?.confidence,
  });

  return {
    ...testResult,
    duration,
    testSuccess: testResult?.success && !!testResult?.content,
  };
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testLLMEventIntegration()
    .then((result) => {
      if (result.testSuccess) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n❌ Test FAILED with error:', error);
      process.exit(1);
    });
}

export { testLLMEventIntegration };
