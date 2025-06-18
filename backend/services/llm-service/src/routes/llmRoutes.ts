import { Router, Request, Response } from 'express';
import { LLMService } from '@uaip/llm-service';
import { logger } from '@uaip/utils';

const router = Router();
const llmService = LLMService.getInstance();

// Generate LLM response
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, systemPrompt, maxTokens, temperature, model, preferredType } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is defined in the body'
      });
    }

    const response = await llmService.generateResponse({
      prompt,
      systemPrompt,
      maxTokens,
      temperature,
      model
    }, preferredType);

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Error generating LLM response', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to generate response'
    });
  }
});

// Generate agent response
router.post('/agent-response', async (req: Request, res: Response) => {
  try {
    const { agent, messages, context, tools } = req.body;

    if (!agent || !messages) {
      return res.status(400).json({
        success: false,
        error: 'Agent and messages are required'
      });
    }

    const response = await llmService.generateAgentResponse({
      agent,
      messages,
      context,
      tools
    });

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Error generating agent response', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to generate agent response'
    });
  }
});

// Generate artifact
router.post('/artifact', async (req: Request, res: Response) => {
  try {
    const { type, prompt, language, framework, requirements } = req.body;

    if (!type || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Type and prompt are required'
      });
    }

    const response = await llmService.generateArtifact({
      type,
      context: prompt,
      language,
      requirements,
      constraints: []
    });

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Error generating artifact', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to generate artifact'
    });
  }
});

// Analyze context
router.post('/analyze-context', async (req: Request, res: Response) => {
  try {
    const { conversationHistory, currentContext, userRequest, agentCapabilities } = req.body;

    if (!conversationHistory) {
      return res.status(400).json({
        success: false,
        error: 'Messages are required'
      });
    }

    const response = await llmService.analyzeContext({
      conversationHistory,
      currentContext,
      userRequest,
      agentCapabilities
    });

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Error analyzing context', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to analyze context'
    });
  }
});

// Get provider statistics
router.get('/providers/stats', async (req: Request, res: Response) => {
  try {
    const stats = await llmService.getProviderStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting provider stats', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get provider statistics'
    });
  }
});

export default router; 