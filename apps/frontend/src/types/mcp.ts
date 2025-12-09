// Re-export MCP types from shared types
// All MCP types are now centralized in @uaip/types

export {
  type MCPServerExecutionType,
  type MCPServerConfig,
  type MCPServerHealth,
  type MCPServer,
  type MCPToolCall,
  type MCPToolResult,
  type MCPCapability,
  type MCPResource,
  type MCPRegistry,
  type MCPPreset,
  MCPServerType,
  MCPServerStatus,
  MCPToolCallStatus,
  MCPCapabilityType,
  MCPResourceType,
  MCPRegistrySchema,
  MCPServerConfigSchema,
  MCPToolCallSchema,
} from '@uaip/types/mcp';

// Keep only frontend-specific MCP extensions here if any
// All core MCP types should be imported from @uaip/types
