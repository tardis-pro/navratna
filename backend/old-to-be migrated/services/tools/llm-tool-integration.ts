// LLM Tool Integration Service for Council of Nycea
// Enables agents to understand, select, and use tools in conversations

import { AgentState, Message } from '../../types/agent';
import { ToolCall, ToolDefinition, ToolResult } from '../../types/tool';
import { toolRegistry } from './tool-registry';
import { DocumentContext } from '../../types/document';

export interface ToolAwareLLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  requiresApproval?: boolean;
  reasoning?: string;
  confidence?: number;
}

export class LLMToolIntegrationService {
  
  /**
   * Analyzes agent's available tools and generates tool-aware system prompt
   */
  static async generateToolAwareSystemPrompt(agent: AgentState): Promise<string> {
    const availableTools = await this.getAgentTools(agent);
    
    if (availableTools.length === 0) {
      return agent.systemPrompt || '';
    }

    const toolDescriptions = availableTools.map(tool => 
      `- ${tool.name} (${tool.id}): ${tool.description}`
    ).join('\n');

    const toolPrompt = `

AVAILABLE TOOLS:
You have access to the following tools that you can use to help with tasks:
${toolDescriptions}

TOOL USAGE GUIDELINES:
- Only use tools when they would genuinely help answer a question or complete a task
- Always explain why you're using a tool and what you expect to achieve
- If a tool fails, explain what happened and try alternative approaches
- Use tools to enhance your responses, not replace thoughtful analysis
- Consider the context and whether a tool is really necessary

TOOL CALL FORMAT:
When you decide to use a tool, indicate this clearly in your response using this format:
[TOOL_CALL: {tool_id}]
Parameters: {parameter_description}
Reasoning: {why_you_chose_this_tool}
[/TOOL_CALL]

Example:
[TOOL_CALL: math-calculator]
Parameters: expression="(15 + 25) * 2", precision=2
Reasoning: I need to calculate this mathematical expression to provide an accurate answer.
[/TOOL_CALL]
`;

    return (agent.systemPrompt || '') + toolPrompt;
  }

  /**
   * Parses LLM response to extract tool calls
   */
  static parseToolCallsFromResponse(response: string): {
    cleanContent: string;
    toolCalls: ToolCall[];
  } {
    const toolCallRegex = /\[TOOL_CALL:\s*([^\]]+)\](.*?)\[\/TOOL_CALL\]/gs;
    const toolCalls: ToolCall[] = [];
    let cleanContent = response;

    let match;
    while ((match = toolCallRegex.exec(response)) !== null) {
      const toolId = match[1].trim();
      const toolContent = match[2].trim();
      
      // Parse parameters and reasoning from tool content
      const paramMatch = toolContent.match(/Parameters:\s*(.+?)(?=\nReasoning:|$)/s);
      const reasoningMatch = toolContent.match(/Reasoning:\s*(.+?)$/s);
      
      const parametersStr = paramMatch ? paramMatch[1].trim() : '';
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'Tool usage requested';

      // Simple parameter parsing (could be enhanced)
      const parameters = this.parseToolParameters(parametersStr);

      const toolCall: ToolCall = {
        id: crypto.randomUUID(),
        toolId,
        parameters,
        reasoning,
        confidence: 0.8 // Default confidence
      };

      toolCalls.push(toolCall);
      
      // Remove tool call from content
      cleanContent = cleanContent.replace(match[0], '').trim();
    }

    return { cleanContent, toolCalls };
  }

  /**
   * Simple parameter parsing from string
   */
  private static parseToolParameters(paramStr: string): Record<string, any> {
    const params: Record<string, any> = {};
    
    // Handle different parameter formats
    if (paramStr.includes('=')) {
      // Format: key1="value1", key2=value2
      const paramPairs = paramStr.split(',').map(p => p.trim());
      for (const pair of paramPairs) {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (key && value) {
          // Remove quotes and parse value
          let parsedValue: any = value.replace(/^["']|["']$/g, '');
          
          // Try to parse as number
          if (!isNaN(Number(parsedValue))) {
            parsedValue = Number(parsedValue);
          }
          // Try to parse as boolean
          else if (parsedValue === 'true' || parsedValue === 'false') {
            parsedValue = parsedValue === 'true';
          }
          
          params[key] = parsedValue;
        }
      }
    } else {
      // Handle JSON-like format
      try {
        const jsonMatch = paramStr.match(/\{.*\}/s);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.warn('Failed to parse JSON parameters:', paramStr);
      }
    }

    return params;
  }

  /**
   * Gets tools available to a specific agent
   */
  static async getAgentTools(agent: AgentState): Promise<ToolDefinition[]> {
    const tools: ToolDefinition[] = [];
    
    for (const toolId of agent.availableTools) {
      const tool = await toolRegistry.get(toolId);
      if (tool && tool.isEnabled) {
        // Check permissions
        if (agent.toolPermissions.allowedTools.includes(toolId) && 
            !agent.toolPermissions.deniedTools.includes(toolId)) {
          tools.push(tool);
        }
      }
    }
    
    return tools;
  }

  /**
   * Recommends tools based on conversation context
   */
  static async recommendToolsForContext(
    agent: AgentState, 
    context: string, 
    conversationHistory: Message[]
  ): Promise<ToolDefinition[]> {
    // Analyze context to suggest relevant tools
    const contextLower = context.toLowerCase();
    const availableTools = await this.getAgentTools(agent);
    
    const scored = availableTools.map(tool => ({
      tool,
      score: this.calculateToolRelevance(tool, contextLower, conversationHistory)
    }));
    
    return scored
      .filter(item => item.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.tool);
  }

  private static calculateToolRelevance(
    tool: ToolDefinition, 
    context: string, 
    history: Message[]
  ): number {
    let score = 0;
    
    // Check tool name and description relevance
    if (tool.name.toLowerCase().includes(context)) score += 0.8;
    if (tool.description.toLowerCase().includes(context)) score += 0.6;
    
    // Check tags
    const relevantTags = tool.tags.filter(tag => 
      context.includes(tag.toLowerCase()) || tag.toLowerCase().includes(context)
    );
    score += relevantTags.length * 0.4;
    
    // Check conversation history for relevant terms
    const recentMessages = history.slice(-5);
    const historyText = recentMessages.map(m => m.content).join(' ').toLowerCase();
    
    if (historyText.includes(tool.category)) score += 0.3;
    if (tool.tags.some(tag => historyText.includes(tag.toLowerCase()))) score += 0.2;
    
    // Specific context patterns
    if (context.includes('calculat') && tool.id.includes('calculator')) score += 1.0;
    if (context.includes('analy') && tool.id.includes('analysis')) score += 1.0;
    if (context.includes('time') && tool.id.includes('time')) score += 1.0;
    if (context.includes('uuid') || context.includes('id') && tool.id.includes('uuid')) score += 1.0;
    
    return Math.min(score, 2.0);
  }

  /**
   * Validates that tool calls are appropriate for the context
   */
  static async validateToolUsage(
    agent: AgentState,
    toolCalls: ToolCall[],
    context: string
  ): Promise<{
    valid: boolean;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    for (const toolCall of toolCalls) {
      // Check if tool exists and is available to agent
      const tool = await toolRegistry.get(toolCall.toolId);
      if (!tool) {
        errors.push(`Tool ${toolCall.toolId} not found`);
        continue;
      }
      
      if (!tool.isEnabled) {
        errors.push(`Tool ${toolCall.toolId} is disabled`);
        continue;
      }
      
      if (!agent.toolPermissions.allowedTools.includes(toolCall.toolId)) {
        errors.push(`Agent not authorized to use tool ${toolCall.toolId}`);
        continue;
      }
      
      if (agent.toolPermissions.deniedTools.includes(toolCall.toolId)) {
        errors.push(`Tool ${toolCall.toolId} is explicitly denied`);
        continue;
      }
      
      // Check if tool usage makes sense in context
      const relevance = this.calculateToolRelevance(tool, context.toLowerCase(), []);
      if (relevance < 0.2) {
        warnings.push(`Tool ${toolCall.toolId} may not be relevant to the current context`);
      }
      
      // Validate required parameters
      if (tool.parameters.required) {
        for (const requiredParam of tool.parameters.required) {
          if (!(requiredParam in toolCall.parameters)) {
            errors.push(`Missing required parameter '${requiredParam}' for tool ${toolCall.toolId}`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Creates a comprehensive tool usage summary for the conversation
   */
  static formatToolUsageSummary(toolCalls: ToolCall[], toolResults: ToolResult[]): string {
    if (toolCalls.length === 0) return '';
    
    const summaries = toolCalls.map((call, index) => {
      const result = toolResults[index];
      const status = result?.success ? '✅' : '❌';
      
      let summary = `${status} **${call.toolId}**: ${call.reasoning}`;
      
      if (result?.success && result.result) {
        summary += `\n   Result: ${JSON.stringify(result.result)}`;
      } else if (result?.error) {
        summary += `\n   Error: ${result.error.message}`;
      }
      
      return summary;
    });
    
    return '\n\n**Tool Usage Summary:**\n' + summaries.join('\n');
  }

  /**
   * Generates context-aware tool suggestions for LLM
   */
  static async generateToolSuggestions(
    agent: AgentState,
    context: string,
    conversationHistory: Message[]
  ): Promise<string> {
    const recommendations = await this.recommendToolsForContext(agent, context, conversationHistory);
    
    if (recommendations.length === 0) {
      return '';
    }
    
    const suggestions = recommendations.map(tool => 
      `- **${tool.name}**: ${tool.description}`
    ).join('\n');
    
    return `\n\n*Suggested tools for this context:*\n${suggestions}`;
  }
}

// Export helper functions for easy use
export async function enhanceAgentWithTools(agent: AgentState): Promise<string> {
  return LLMToolIntegrationService.generateToolAwareSystemPrompt(agent);
}

export function parseToolCalls(response: string): {
  cleanContent: string;
  toolCalls: ToolCall[];
} {
  return LLMToolIntegrationService.parseToolCallsFromResponse(response);
}

export async function validateAgentToolUsage(
  agent: AgentState,
  toolCalls: ToolCall[],
  context: string
) {
  return LLMToolIntegrationService.validateToolUsage(agent, toolCalls, context);
} 