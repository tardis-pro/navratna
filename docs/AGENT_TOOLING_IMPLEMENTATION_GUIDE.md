# Agent Tooling and Automation Implementation Guide

## Overview

This guide provides a comprehensive roadmap for implementing the Agent Tooling and Automation capabilities in the Council of Nycea platform. The implementation transforms agents from passive discussants into active participants capable of interacting with external systems and performing automated tasks.

**NEW: MCP Server Integration** - The system now includes full support for Model Context Protocol (MCP) servers from https://github.com/modelcontextprotocol/servers, enabling agents to use a vast ecosystem of external tools and data sources.

## Architecture Overview

The tooling system consists of several key components:

### 1. Core Type System (`src/types/tool.ts`)
- **ToolDefinition**: Comprehensive tool metadata and configuration
- **ToolExecution**: Runtime execution tracking and state management  
- **ToolCall/ToolResult**: Request/response interfaces for tool usage
- **Permission & Budget Management**: Security and cost control interfaces

### 2. MCP Integration System
- **MCP Types** (`src/types/mcp.ts`): Type definitions for MCP server management
- **MCP Server Manager** (`src/services/mcp/mcp-server-manager.ts`): Process management and communication
- **MCP Tool Bridge** (`src/services/mcp/mcp-tool-bridge.ts`): Converts MCP tools to agent tools
- **MCP Server Presets** (`src/services/mcp/mcp-server-presets.ts`): Pre-configured popular servers

### 3. Tool Registry (`src/services/tools/tool-registry.ts`)
- Centralized tool registration and discovery
- Tool validation and metadata management
- Search and recommendation capabilities
- Event-driven architecture for tool lifecycle management

### 4. Execution Engine (`src/services/tools/tool-execution-engine.ts`)
- Asynchronous tool execution with queuing
- Retry logic with exponential backoff
- Approval workflows for restricted tools
- **NEW**: MCP tool execution support
- Comprehensive monitoring and statistics

### 5. LLM Integration (`src/services/tools/llm-tool-integration.ts`)
- Tool-aware prompt generation for agents
- Tool call parsing from LLM responses
- Context-aware tool recommendations
- Usage validation and safety checks

### 6. Base Tools (`src/services/tools/base-tools.ts`)
- Safe, fundamental tools (math, text analysis, time utilities, UUID generation)
- Extensible executor pattern for adding new tools
- Comprehensive error handling and validation

### 7. UI Components
- **ToolUsageIndicator** (`src/components/ToolUsageIndicator.tsx`): Real-time tool usage visualization
- **MCPServerManager** (`src/components/MCPServerManager.tsx`): **NEW** - MCP server management interface

## MCP Server Integration Features

### Supported MCP Servers
The system includes presets for popular MCP servers:

#### Safe Servers (Auto-enabled)
- **Memory Server**: Persistent conversation context
- **Text Analysis Tools**: Document processing capabilities

#### Moderate Security Servers
- **Git Repository**: Code analysis and repository exploration
- **SQLite Database**: Local database querying
- **Brave Search**: Web search capabilities

#### Restricted Servers (Requires Approval)
- **File System**: Secure file operations within specified directories
- **GitHub Integration**: Repository management and collaboration
- **PostgreSQL**: Database analytics and reporting
- **Google Drive**: Cloud document access
- **Slack Integration**: Team communication tools

#### Dangerous Servers (High Security)
- **Puppeteer**: Web scraping and browser automation

### MCP Server Management
- **Easy Setup**: One-click installation from presets
- **Configuration Management**: Custom arguments and environment variables
- **Process Monitoring**: Real-time status, health checks, and statistics
- **Automatic Tool Discovery**: MCP tools automatically become available to agents
- **Security Controls**: Permission-based access and approval workflows

### Command Support
- **NPX Servers**: TypeScript/JavaScript servers (e.g., `npx -y @modelcontextprotocol/server-memory`)
- **UVX Servers**: Python servers (e.g., `uvx mcp-server-git`)
- **Custom Commands**: Support for any command-line MCP server

## Implementation Status

### ✅ Completed Components

1. **Type System**: Complete type definitions for the entire tooling ecosystem
2. **Tool Registry**: Full implementation with search, validation, and event handling
3. **Execution Engine**: Comprehensive execution management with monitoring
4. **Base Tools**: Four fundamental tools with safe execution patterns
5. **LLM Integration**: Tool-aware prompt generation and response parsing
6. **Agent Context**: Enhanced context with tool capabilities
7. **UI Indicators**: Rich tool usage visualization components
8. **�� MCP Integration**: Complete MCP server support with bridge, manager, and UI
9. **🆕 MCP Presets**: 10 pre-configured popular MCP servers
10. **🆕 MCP Server Manager UI**: Full server management interface

### 🔄 Integration Tasks

#### Task 1: Update Agent Component Integration
**File**: `src/components/Agent.tsx`
**Status**: Ready for integration
**Objective**: Integrate tool capabilities into the main Agent component

```typescript
// Add to Agent component imports
import { ToolUsageIndicator } from './ToolUsageIndicator';
import { parseToolCalls } from '../services/tools/llm-tool-integration';

// Enhance generateResponse method to handle tool calls
const generateResponse = useCallback(async () => {
  if (!agent || agent.isThinking) return;

  try {
    updateAgentState(id, { isThinking: true, error: null });

    const activeDocument = activeDocumentId ? documents[activeDocumentId] : null;
    const allMessages = getAllMessages();
    const optimizedHistory = getOptimizedHistory(allMessages);

    // Generate response with tool capabilities
    const response = await LLMService.generateResponse(
      agent,
      activeDocument,
      optimizedHistory
    );

    if (response.error) {
      throw new Error(response.error);
    }

    // Handle tool calls if present
    let finalContent = response.content;
    let toolResults = [];
    
    if (response.toolCalls && response.toolCalls.length > 0) {
      // Execute tool calls (both base tools and MCP tools)
      for (const toolCall of response.toolCalls) {
        try {
          const result = await executeToolCall(id, toolCall);
          toolResults.push(result);
          
          // Integrate result into response if successful
          if (result.success) {
            finalContent += `\n\n[Tool Result: ${JSON.stringify(result.result)}]`;
          }
        } catch (error) {
          console.error('Tool execution failed:', error);
          toolResults.push({
            callId: toolCall.id,
            executionId: 'failed',
            success: false,
            error: { type: 'execution', message: error.message },
            executionTime: 0
          });
        }
      }
    }

    // Create message with tool data
    const newMessage: Message = {
      id: crypto.randomUUID(),
      content: finalContent,
      sender: agent.name,
      timestamp: new Date(),
      type: 'response',
      toolCalls: response.toolCalls,
      toolResults: toolResults.length > 0 ? toolResults : undefined
    };

    addMessage(id, newMessage);
    updateAgentState(id, {
      isThinking: false,
      currentResponse: finalContent,
    });
  } catch (error) {
    updateAgentState(id, {
      isThinking: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}, [agent, id, activeDocumentId, documents, updateAgentState, getAllMessages, addMessage, executeToolCall]);

// Add tool usage indicator to render method
return (
  <Card className={`...`}>
    {/* Existing agent content */}
    
    {/* Add tool usage indicator */}
    {agent.currentToolExecution || (agent.conversationHistory[agent.conversationHistory.length - 1]?.toolCalls) && (
      <ToolUsageIndicator
        toolCalls={agent.conversationHistory[agent.conversationHistory.length - 1]?.toolCalls}
        toolResults={agent.conversationHistory[agent.conversationHistory.length - 1]?.toolResults}
        currentExecution={agent.currentToolExecution}
        isUsingTool={agent.isUsingTool}
        onApproveExecution={(executionId) => approveToolExecution(executionId, 'user')}
        onRetryExecution={(executionId) => {/* Implement retry logic */}}
        className="mt-2"
      />
    )}
  </Card>
);
```

#### Task 2: Add MCP Server Management to Settings
**File**: `src/components/Settings.tsx` or main dashboard
**Objective**: Make MCP server management accessible to users

```typescript
// Add MCP Server Manager tab or section
import { MCPServerManager } from './MCPServerManager';

// In settings or main dashboard:
<MCPServerManager />
```

#### Task 3: Initialize MCP Servers on Startup
**File**: `src/main.tsx` or app initialization
**Objective**: Auto-start enabled MCP servers

```typescript
import { mcpServerManager } from './services/mcp/mcp-server-manager';
import { mcpServerPresets, getSafeMCPServerPresets } from './services/mcp/mcp-server-presets';

// Initialize safe MCP servers on app startup
async function initializeMCPServers() {
  const safePresets = getSafeMCPServerPresets();
  
  for (const preset of safePresets) {
    const config = {
      ...preset.config,
      id: crypto.randomUUID(),
      enabled: true,
      autoStart: true
    };
    
    try {
      mcpServerManager.registerServer(config);
      if (config.autoStart) {
        await mcpServerManager.start(config.id);
      }
    } catch (error) {
      console.warn(`Failed to initialize MCP server ${preset.name}:`, error);
    }
  }
}

// Call during app initialization
initializeMCPServers();
```

#### Task 4: Backend Process Management (Production)
**Objective**: Replace mock process management with real subprocess handling

For production deployment, the MCP server manager needs to be implemented on the backend with real process management:

```typescript
// Backend implementation (Node.js)
import { spawn, ChildProcess } from 'child_process';

class ProductionMCPServerManager {
  private processes: Map<string, ChildProcess> = new Map();
  
  async startProcess(config: MCPServerConfig): Promise<ChildProcess> {
    const process = spawn(config.command, config.args, {
      env: { ...process.env, ...config.env },
      cwd: config.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Set up JSON-RPC communication over stdio
    process.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: { capabilities: {} }
    }) + '\n');
    
    return process;
  }
}
```

### 🆕 MCP-Specific Tasks

#### Task 5: Advanced MCP Features
1. **Resource Access**: Implement MCP resource (file/URI) access
2. **Prompt Templates**: Use MCP prompt templates for better LLM interactions
3. **Streaming Support**: Add streaming capabilities for long-running operations
4. **Progress Tracking**: Real-time progress updates for MCP operations

#### Task 6: Security Enhancements
1. **Sandboxed Execution**: Containerize dangerous MCP servers
2. **Network Isolation**: Control external network access for MCP servers
3. **Resource Limits**: CPU/memory constraints for MCP processes
4. **Audit Logging**: Complete audit trail for MCP tool usage

## Development Workflow

### Phase 1: Core Integration (Week 1)
1. ✅ Complete MCP type system and bridge
2. ✅ Implement MCP server manager and presets
3. ✅ Create MCP server management UI
4. 🔄 Integrate MCP servers into agent workflow
5. 🔄 Test basic MCP tool functionality

### Phase 2: Production Features (Week 2)
1. Implement real process management (backend)
2. Add security sandboxing for dangerous servers
3. Create comprehensive monitoring dashboard
4. Test approval workflows for restricted tools

### Phase 3: Advanced MCP Features (Week 3)
1. Resource and prompt template support
2. Streaming and progress tracking
3. Advanced error handling and recovery
4. Performance optimization

### Phase 4: Deployment and Monitoring (Week 4)
1. Production deployment preparation
2. Security audit and penetration testing
3. Performance benchmarking
4. Documentation and user training

## MCP Server Setup Examples

### Quick Start with Safe Servers
```bash
# Memory server (automatically included)
npm install -g @modelcontextprotocol/server-memory

# Git repository analysis
pip install mcp-server-git
uvx mcp-server-git --repository /path/to/repo

# SQLite database access
npm install -g @modelcontextprotocol/server-sqlite
npx @modelcontextprotocol/server-sqlite /path/to/database.db
```

### Advanced Setup with API Keys
```bash
# GitHub integration
export GITHUB_PERSONAL_ACCESS_TOKEN="your_token_here"
npx @modelcontextprotocol/server-github

# Brave Search
export BRAVE_API_KEY="your_api_key_here"
npx @modelcontextprotocol/server-brave-search

# Slack integration
export SLACK_BOT_TOKEN="your_bot_token_here"
npx @modelcontextprotocol/server-slack
```

## Security Considerations

### MCP Server Security
- **Process Isolation**: Each MCP server runs in its own process
- **Permission Controls**: Fine-grained access control per agent
- **Approval Workflows**: High-risk operations require human approval
- **Resource Limits**: CPU, memory, and execution time constraints
- **Network Restrictions**: Controlled external network access
- **Audit Logging**: Complete trail of all MCP operations

### Tool Security Framework
- **Input Validation**: Strict parameter validation for all tools
- **Output Sanitization**: Clean and validate tool outputs
- **Rate Limiting**: Per-agent and per-tool usage limits
- **Rollback Capabilities**: Undo mechanisms for destructive operations

## Monitoring and Observability

### MCP-Specific Metrics
- MCP server uptime and health status
- Tool execution success rates by server
- Resource usage per MCP server
- Communication latency and throughput

### Alerting
- MCP server failures or crashes
- Excessive resource usage
- Security policy violations
- Performance degradation

## Troubleshooting Guide

### Common MCP Issues
1. **Server not starting**: Check command availability (npx/uvx)
2. **Communication failures**: Verify JSON-RPC protocol compliance
3. **Tool not found**: Ensure server is running and tools are bridged
4. **Permission denied**: Check agent tool permissions and approval status
5. **Environment variables**: Verify required API keys and configurations

### Debug Tools
- MCP server status dashboard
- Tool execution history viewer
- Communication protocol inspector
- Performance profiler with MCP metrics

## Future Enhancements

### Planned MCP Features
- **Hot Reloading**: Dynamic tool registration without restart
- **Load Balancing**: Multiple instances of the same MCP server
- **Failover**: Automatic fallback to backup servers
- **Caching**: Intelligent result caching for expensive operations
- **Compression**: Efficient data transfer for large results

### Advanced Integration
- **Custom MCP Servers**: Tools for building domain-specific servers
- **Server Marketplace**: Community-driven server discovery
- **Webhook Integration**: Event-driven server communication
- **GraphQL Bridge**: Expose MCP tools via GraphQL API

This implementation guide now provides complete coverage of both the base tool system and the new MCP server integration, making Council of Nycea agents capable of leveraging the entire ecosystem of Model Context Protocol servers for enhanced capabilities. 