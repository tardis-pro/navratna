import { EventBusService } from '@uaip/infra/eventBus';
import { logger } from '@uaip/utils';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SandboxConfig {
  maxExecutionTime: number;
  maxMemory: string;
  maxCpu: string;
  networkAccess: boolean;
  fileSystemAccess: 'none' | 'readonly' | 'readwrite';
  allowedPaths?: string[];
  env?: Record<string, string>;
}

interface SandboxExecution {
  id: string;
  toolId: string;
  parameters: Record<string, any>;
  config: SandboxConfig;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  startTime: number;
  endTime?: number;
  result?: any;
  error?: string;
}

interface RuntimeExecutionConfig {
  image: string;
  command: string;
  environment: Record<string, string>;
}

/**
 * Service for executing tools in isolated sandbox environments
 */
export class SandboxExecutionService {
  private static instance: SandboxExecutionService;
  private eventBus: EventBusService;
  private executions = new Map<string, SandboxExecution>();
  private isListening = false;

  private readonly DEFAULT_CONFIG: SandboxConfig = {
    maxExecutionTime: 30000, // 30 seconds
    maxMemory: '256MB',
    maxCpu: '0.5',
    networkAccess: false,
    fileSystemAccess: 'readonly',
    allowedPaths: ['/tmp/sandbox'],
  };

  private constructor() {
    this.eventBus = EventBusService.getInstance();
  }

  static getInstance(): SandboxExecutionService {
    if (!SandboxExecutionService.instance) {
      SandboxExecutionService.instance = new SandboxExecutionService();
    }
    return SandboxExecutionService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isListening) {
      logger.warn('Sandbox execution service already initialized');
      return;
    }

    try {
      // Subscribe to sandbox execution events
      await this.eventBus.subscribe('sandbox.execute.tool', this.handleSandboxExecution.bind(this));

      this.isListening = true;
      logger.info('Sandbox execution service initialized');
    } catch (error) {
      logger.error('Failed to initialize sandbox execution service', error);
      throw error;
    }
  }

  private async handleSandboxExecution(event: any): Promise<void> {
    const executionId = event.requestId || randomUUID();
    const { toolId, parameters, config: userConfig } = event;

    const execution: SandboxExecution = {
      id: executionId,
      toolId,
      parameters,
      config: { ...this.DEFAULT_CONFIG, ...userConfig },
      status: 'pending',
      startTime: Date.now(),
    };

    this.executions.set(executionId, execution);

    try {
      logger.info('Starting sandbox execution', {
        executionId,
        toolId,
        config: execution.config,
      });

      const result = await this.simulateSandboxExecution(execution);

      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.result = result;

      // Publish success response
      await this.eventBus.publish(`sandbox.response.${executionId}`, {
        requestId: executionId,
        status: 'SUCCESS',
        result,
        executionTime: execution.endTime - execution.startTime,
        sandbox: true,
      });

      logger.info('Sandbox execution completed', {
        executionId,
        executionTime: execution.endTime - execution.startTime,
      });
    } catch (error) {
      await this.handleExecutionError(execution, error);
    } finally {
      // Cleanup after delay
      setTimeout(() => {
        this.cleanupExecution(executionId);
      }, 60000); // 1 minute
    }
  }

  private async simulateSandboxExecution(execution: SandboxExecution): Promise<any> {
    execution.status = 'running';

    const runtime = this.getRuntimeExecutionConfig(execution);
    const timeoutMs = Math.max(1000, execution.config.maxExecutionTime);

    const dockerAvailable = await this.isDockerAvailable();
    if (dockerAvailable) {
      return this.executeInDocker(execution, runtime, timeoutMs);
    }

    logger.warn('Docker unavailable, using local execution fallback', {
      executionId: execution.id,
      toolId: execution.toolId,
    });

    return this.executeLocally(execution, runtime, timeoutMs);
  }

  private getRuntimeExecutionConfig(execution: SandboxExecution): RuntimeExecutionConfig {
    const paramsJson = JSON.stringify(execution.parameters ?? {});
    const environment: Record<string, string> = {
      PARAMS: paramsJson,
      TOOL_ID: execution.toolId,
    };

    const jsCommand = [
      'node -e',
      JSON.stringify(
        "const toolId = process.env.TOOL_ID || 'unknown';" +
          "const params = JSON.parse(process.env.PARAMS || '{}');" +
          'let result;' +
          "if (toolId === 'math-calculator') {" +
          'const operation = String(params.operation || "add").toLowerCase();' +
          'const operands = Array.isArray(params.operands) ? params.operands : [];' +
          'let value = null;' +
          "if (operation === 'add' || operation === 'addition') value = operands.reduce((a, b) => a + Number(b || 0), 0);" +
          "else if (operation === 'multiply' || operation === 'multiplication') value = operands.reduce((a, b) => a * Number(b || 1), 1);" +
          "else if (operation === 'subtract' || operation === 'subtraction') value = operands.reduce((a, b, i) => (i === 0 ? Number(b || 0) : a - Number(b || 0)), 0);" +
          "else if (operation === 'divide' || operation === 'division') value = operands.reduce((a, b, i) => { const n = Number(b || 0); if (i === 0) return n; if (n === 0) throw new Error('Division by zero'); return a / n; }, 0);" +
          'else value = null;' +
          "result = { operation, operands, result: value, runtime: 'node' };" +
          "} else if (toolId === 'text-analysis') {" +
          'const text = String(params.text || "");' +
          "result = { characterCount: text.length, wordCount: text.trim() ? text.trim().split(/\\s+/).length : 0, runtime: 'node' };" +
          "} else if (toolId === 'time-utility') {" +
          "result = { now: new Date().toISOString(), timezone: params.timezone || 'UTC', runtime: 'node' };" +
          '} else {' +
          "result = { toolId, parameters: params, runtime: 'node' };" +
          '}' +
          'console.log(JSON.stringify(result));"
      ),
    ].join(' ');

    const pythonCommand = [
      'python3 -c',
      JSON.stringify(
        'import json, os\n' +
          "tool_id = os.environ.get('TOOL_ID', 'unknown')\n" +
          "params = json.loads(os.environ.get('PARAMS', '{}'))\n" +
          "print(json.dumps({'toolId': tool_id, 'parameters': params, 'runtime': 'python'}))\n"
      ),
    ].join(' ');

    const shellCommand = 'sh -lc "printf \"%s\\n\" \"$PARAMS\""';

    if (execution.toolId.startsWith('python-') || execution.toolId.includes('python')) {
      return {
        image: 'python:3.11-slim',
        command: pythonCommand,
        environment,
      };
    }

    if (execution.toolId.startsWith('shell-') || execution.toolId.includes('shell')) {
      return {
        image: 'alpine:latest',
        command: shellCommand,
        environment,
      };
    }

    return {
      image: 'node:20-alpine',
      command: jsCommand,
      environment,
    };
  }

  private async executeInDocker(
    execution: SandboxExecution,
    runtime: RuntimeExecutionConfig,
    timeoutMs: number
  ): Promise<any> {
    const containerName = `sandbox-${execution.id}`.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 60);
    const envFlags = Object.entries(runtime.environment)
      .map(([key, value]) => `--env ${key}=${JSON.stringify(value)}`)
      .join(' ');

    const dockerCommand = [
      'docker run --rm',
      `--name ${containerName}`,
      '--memory 128m',
      '--cpus 0.5',
      '--network none',
      envFlags,
      runtime.image,
      'sh -c',
      JSON.stringify(runtime.command),
    ].join(' ');

    try {
      const { stdout, stderr } = await execAsync(dockerCommand, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });
      return this.formatExecutionResult(execution, stdout, stderr, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('timed out')) {
        execution.status = 'timeout';
        throw new Error('Execution timeout exceeded');
      }
      throw error;
    }
  }

  private async executeLocally(
    execution: SandboxExecution,
    runtime: RuntimeExecutionConfig,
    timeoutMs: number
  ): Promise<any> {
    try {
      const { stdout, stderr } = await execAsync(runtime.command, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          ...runtime.environment,
        },
      });

      return this.formatExecutionResult(execution, stdout, stderr, false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('timed out')) {
        execution.status = 'timeout';
        throw new Error('Execution timeout exceeded');
      }
      throw error;
    }
  }

  private formatExecutionResult(
    execution: SandboxExecution,
    stdout: string,
    stderr: string,
    sandboxed: boolean
  ): Record<string, unknown> {
    const trimmedStdout = stdout.trim();
    const trimmedStderr = stderr.trim();

    let parsedOutput: unknown = trimmedStdout;
    if (trimmedStdout) {
      try {
        parsedOutput = JSON.parse(trimmedStdout);
      } catch {
        parsedOutput = trimmedStdout;
      }
    }

    return {
      toolId: execution.toolId,
      parameters: execution.parameters,
      output: parsedOutput,
      stdout: trimmedStdout,
      stderr: trimmedStderr,
      sandbox: sandboxed,
      message: `Sandbox execution of ${execution.toolId} completed`,
    };
  }

  private async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker info', { timeout: 5000, maxBuffer: 1024 * 1024 });
      return true;
    } catch {
      return false;
    }
  }

  private async handleExecutionError(execution: SandboxExecution, error: any): Promise<void> {
    logger.error('Sandbox execution failed', {
      executionId: execution.id,
      toolId: execution.toolId,
      error: error.message || String(error),
    });

    if (execution.status !== 'timeout') {
      execution.status = 'failed';
    }
    execution.endTime = Date.now();
    execution.error =
      execution.status === 'timeout'
        ? 'Execution timeout exceeded'
        : error.message || 'Sandbox execution failed';

    await this.eventBus.publish(`sandbox.response.${execution.id}`, {
      requestId: execution.id,
      status: 'ERROR',
      error: execution.error,
      executionTime: execution.endTime - execution.startTime,
      sandbox: true,
    });
  }

  private async cleanupExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (execution) {
      this.executions.delete(executionId);
      logger.debug('Cleaned up sandbox execution', { executionId });
    }
  }

  /**
   * Get sandbox execution status
   */
  async getExecutionStatus(executionId: string): Promise<SandboxExecution | null> {
    return this.executions.get(executionId) || null;
  }

  /**
   * Terminate a running sandbox execution
   */
  async terminateExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'failed';
      execution.error = 'Execution terminated by user';
      execution.endTime = Date.now();

      await this.eventBus.publish(`sandbox.response.${executionId}`, {
        requestId: executionId,
        status: 'ERROR',
        error: execution.error,
        executionTime: execution.endTime - execution.startTime,
        sandbox: true,
      });
    }
  }

  /**
   * Get sandbox metrics
   */
  async getMetrics(): Promise<{
    activeExecutions: number;
    totalExecutions: number;
    averageExecutionTime: number;
    failureRate: number;
  }> {
    const executions = Array.from(this.executions.values());
    const completed = executions.filter((e) => e.status === 'completed' || e.status === 'failed');
    const failed = executions.filter((e) => e.status === 'failed' || e.status === 'timeout');

    const totalTime = completed.reduce((sum, e) => sum + (e.endTime! - e.startTime), 0);

    return {
      activeExecutions: executions.filter((e) => e.status === 'running').length,
      totalExecutions: executions.length,
      averageExecutionTime: completed.length > 0 ? totalTime / completed.length : 0,
      failureRate: executions.length > 0 ? failed.length / executions.length : 0,
    };
  }
}
