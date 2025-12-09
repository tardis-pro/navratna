// MCP Configuration Upload Interface
// Allows users to upload .mcp.json files through the UI with validation and real-time feedback

import React, { useState, useCallback, useRef } from 'react';
import { uaipAPI } from '@/utils/uaip-api';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Play,
  Server,
} from 'lucide-react';

interface MCPServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

interface MCPConfig {
  mcpServers: Record<string, MCPServer>;
}

interface ParsedServer extends MCPServer {
  name: string;
  isValid: boolean;
  validationErrors: string[];
}

interface UploadState {
  isDragging: boolean;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  success: boolean;
  parsedConfig: MCPConfig | null;
  validatedServers: ParsedServer[];
  installationStatus: Record<string, 'pending' | 'installing' | 'success' | 'error'>;
  installationErrors: Record<string, string>;
}

interface MCPConfigUploadProps {
  onUploadSuccess?: (config: MCPConfig) => void;
  onUploadError?: (error: string) => void;
  className?: string;
}

const MCPConfigUpload: React.FC<MCPConfigUploadProps> = ({
  onUploadSuccess,
  onUploadError,
  className = '',
}) => {
  const [state, setState] = useState<UploadState>({
    isDragging: false,
    isUploading: false,
    uploadProgress: 0,
    error: null,
    success: false,
    parsedConfig: null,
    validatedServers: [],
    installationStatus: {},
    installationErrors: {},
  });

  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateMCPConfig = useCallback(
    (config: any): { isValid: boolean; errors: string[]; servers: ParsedServer[] } => {
      const errors: string[] = [];
      const servers: ParsedServer[] = [];

      // Check if config has mcpServers property
      if (!config || typeof config !== 'object') {
        errors.push('Invalid JSON structure');
        return { isValid: false, errors, servers };
      }

      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        errors.push('Missing or invalid "mcpServers" property');
        return { isValid: false, errors, servers };
      }

      // Validate each server
      Object.entries(config.mcpServers).forEach(([name, serverConfig]: [string, any]) => {
        const serverErrors: string[] = [];
        let isValid = true;

        // Validate server name
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          serverErrors.push('Server name cannot be empty');
          isValid = false;
        }

        // Validate command
        if (!serverConfig.command || typeof serverConfig.command !== 'string') {
          serverErrors.push('Missing or invalid "command" property');
          isValid = false;
        }

        // Validate args
        if (!Array.isArray(serverConfig.args)) {
          serverErrors.push('Missing or invalid "args" property (must be array)');
          isValid = false;
        } else {
          serverConfig.args.forEach((arg: any, index: number) => {
            if (typeof arg !== 'string') {
              serverErrors.push(`Argument ${index + 1} must be a string`);
              isValid = false;
            }
          });
        }

        // Validate optional env
        if (serverConfig.env && typeof serverConfig.env !== 'object') {
          serverErrors.push('Environment variables must be an object');
          isValid = false;
        }

        // Validate optional disabled
        if (serverConfig.disabled !== undefined && typeof serverConfig.disabled !== 'boolean') {
          serverErrors.push('Disabled property must be a boolean');
          isValid = false;
        }

        servers.push({
          name,
          command: serverConfig.command || '',
          args: serverConfig.args || [],
          env: serverConfig.env,
          disabled: serverConfig.disabled,
          isValid,
          validationErrors: serverErrors,
        });

        if (!isValid) {
          errors.push(`Server "${name}": ${serverErrors.join(', ')}`);
        }
      });

      return {
        isValid: errors.length === 0,
        errors,
        servers,
      };
    },
    []
  );

  const handleFileRead = useCallback(
    (file: File) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const config = JSON.parse(content);

          const validation = validateMCPConfig(config);

          setState((prev) => ({
            ...prev,
            parsedConfig: validation.isValid ? config : null,
            validatedServers: validation.servers,
            error: validation.isValid ? null : `Validation errors: ${validation.errors.join('; ')}`,
            success: false,
          }));
        } catch (error) {
          setState((prev) => ({
            ...prev,
            error: `Invalid JSON file: ${error instanceof Error ? error.message : 'Parse error'}`,
            parsedConfig: null,
            validatedServers: [],
            success: false,
          }));
        }
      };

      reader.onerror = () => {
        setState((prev) => ({
          ...prev,
          error: 'Failed to read file',
          success: false,
        }));
      };

      reader.readAsText(file);
    },
    [validateMCPConfig]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setState((prev) => ({ ...prev, isDragging: false }));

      const files = Array.from(e.dataTransfer.files);
      const mcpFile = files.find(
        (file) =>
          file.name.endsWith('.mcp.json') ||
          (file.name.endsWith('.json') && file.name.includes('mcp'))
      );

      if (!mcpFile) {
        setState((prev) => ({
          ...prev,
          error: 'Please upload a valid .mcp.json file',
        }));
        return;
      }

      handleFileRead(mcpFile);
    },
    [handleFileRead]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileRead(file);
      }
    },
    [handleFileRead]
  );

  const handleInstallServers = useCallback(async () => {
    if (!state.parsedConfig) return;

    setState((prev) => ({
      ...prev,
      isUploading: true,
      uploadProgress: 0,
      installationStatus: {},
      installationErrors: {},
    }));

    try {
      // Create a file from the parsed config
      const configBlob = new Blob([JSON.stringify(state.parsedConfig, null, 2)], {
        type: 'application/json',
      });
      const configFile = new File([configBlob], 'uploaded.mcp.json', {
        type: 'application/json',
      });

      // Upload using the uaipAPI
      const result = await uaipAPI.mcp.uploadConfig(configFile);

      setState((prev) => ({
        ...prev,
        isUploading: false,
        uploadProgress: 100,
        success: true,
        error: null,
        installationStatus: result.installationStatus || {},
        installationErrors: result.installationErrors || {},
      }));

      onUploadSuccess?.(state.parsedConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setState((prev) => ({
        ...prev,
        isUploading: false,
        error: errorMessage,
        success: false,
      }));

      onUploadError?.(errorMessage);
    }
  }, [state.parsedConfig, onUploadSuccess, onUploadError]);

  const resetState = useCallback(() => {
    setState({
      isDragging: false,
      isUploading: false,
      uploadProgress: 0,
      error: null,
      success: false,
      parsedConfig: null,
      validatedServers: [],
      installationStatus: {},
      installationErrors: {},
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const renderServerPreview = () => {
    if (state.validatedServers.length === 0) return null;

    return (
      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Detected Servers ({state.validatedServers.length})
          </h3>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center text-blue-400 hover:text-blue-300"
          >
            {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
            <span className="ml-1">{showPreview ? 'Hide' : 'Show'} Details</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.validatedServers.map((server) => (
            <div
              key={server.name}
              className={`p-4 rounded-lg border ${
                server.isValid
                  ? 'bg-gray-800 border-green-500/30'
                  : 'bg-red-900/20 border-red-500/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <Server size={16} className="text-gray-400 mr-2" />
                  <span className="font-medium text-white">{server.name}</span>
                </div>
                {server.isValid ? (
                  <CheckCircle size={16} className="text-green-400" />
                ) : (
                  <AlertCircle size={16} className="text-red-400" />
                )}
              </div>

              {showPreview && (
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-400">Command:</span>
                    <span className="ml-2 text-white font-mono">{server.command}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Args:</span>
                    <div className="ml-2 text-white font-mono">
                      [{server.args.map((arg) => `"${arg}"`).join(', ')}]
                    </div>
                  </div>
                  {server.env && (
                    <div>
                      <span className="text-gray-400">Environment:</span>
                      <div className="ml-2 text-white font-mono text-xs">
                        {Object.keys(server.env).length} variables
                      </div>
                    </div>
                  )}
                  {server.disabled && (
                    <div className="text-yellow-400 text-xs">⚠️ Server is disabled</div>
                  )}
                  {!server.isValid && (
                    <div className="text-red-400 text-xs">
                      Errors: {server.validationErrors.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Installation status */}
              {state.installationStatus[server.name] && (
                <div className="mt-2 text-xs">
                  <span className="text-gray-400">Status:</span>
                  <span
                    className={`ml-2 ${
                      state.installationStatus[server.name] === 'success'
                        ? 'text-green-400'
                        : state.installationStatus[server.name] === 'error'
                          ? 'text-red-400'
                          : state.installationStatus[server.name] === 'installing'
                            ? 'text-yellow-400'
                            : 'text-gray-400'
                    }`}
                  >
                    {state.installationStatus[server.name]}
                  </span>
                  {state.installationErrors[server.name] && (
                    <div className="text-red-400 mt-1">{state.installationErrors[server.name]}</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`bg-gray-900 text-white rounded-lg p-6 ${className}`}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white mb-2">Upload MCP Configuration</h2>
        <p className="text-gray-400 text-sm">
          Upload a .mcp.json file to automatically install and configure MCP servers
        </p>
      </div>

      {/* File Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setState((prev) => ({ ...prev, isDragging: true }));
        }}
        onDragLeave={() => setState((prev) => ({ ...prev, isDragging: false }))}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          state.isDragging
            ? 'border-blue-400 bg-blue-900/20'
            : 'border-gray-600 hover:border-gray-500'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.mcp.json"
          onChange={handleFileInput}
          className="hidden"
        />

        <div className="flex flex-col items-center">
          <Upload size={48} className="text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Drop your .mcp.json file here</h3>
          <p className="text-gray-400 mb-4">or click to browse files</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Browse Files
          </button>
        </div>
      </div>

      {/* Error Display */}
      {state.error && (
        <div className="mt-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg">
          <div className="flex items-start">
            <AlertCircle size={20} className="text-red-400 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-red-400 font-medium">Upload Error</h4>
              <p className="text-red-300 text-sm mt-1">{state.error}</p>
            </div>
            <button onClick={resetState} className="ml-auto text-red-400 hover:text-red-300">
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Success Display */}
      {state.success && (
        <div className="mt-4 p-4 bg-green-900/20 border border-green-500/50 rounded-lg">
          <div className="flex items-start">
            <CheckCircle size={20} className="text-green-400 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-green-400 font-medium">Upload Successful</h4>
              <p className="text-green-300 text-sm mt-1">
                MCP configuration uploaded and servers are being installed
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Server Preview */}
      {renderServerPreview()}

      {/* Action Buttons */}
      {state.parsedConfig && !state.success && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-400">
            {state.validatedServers.filter((s) => s.isValid).length} of{' '}
            {state.validatedServers.length} servers valid
          </div>
          <div className="flex space-x-3">
            <button
              onClick={resetState}
              className="px-4 py-2 text-gray-400 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInstallServers}
              disabled={state.isUploading || state.validatedServers.every((s) => !s.isValid)}
              className="flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {state.isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Installing...
                </>
              ) : (
                <>
                  <Play size={16} className="mr-2" />
                  Install Servers
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {state.isUploading && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>Installing MCP servers...</span>
            <span>{Math.round(state.uploadProgress)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${state.uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Example Configuration */}
      <div className="mt-8 p-4 bg-gray-800 rounded-lg">
        <h4 className="text-white font-medium mb-2 flex items-center">
          <FileText size={16} className="mr-2" />
          Example Configuration
        </h4>
        <pre className=" text-left font-mono text-sm text-gray-300 overflow-x-auto">
          {JSON.stringify(
            {
              mcpServers: {
                calculator: {
                  command: 'uvx',
                  args: ['mcp-server-calculator'],
                },
                filesystem: {
                  command: 'npx',
                  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
                },
                'custom-server': {
                  command: 'node',
                  args: ['./my-server.js'],
                  env: {
                    API_KEY: 'your-api-key',
                  },
                  disabled: false,
                },
              },
            },
            null,
            2
          )}
        </pre>
      </div>
    </div>
  );
};

export default MCPConfigUpload;
