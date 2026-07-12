// exec-node-mcp — Docker CLI runner (data-plane isolation).
//
// Choice: shell out to the `docker` CLI rather than the dockerode library.
// Rationale — (1) zero new native/npm deps to compile on the EC2 host; the agent
// stays on @uaip/* only, mirroring how mcp_client_service already shells commands
// out; (2) every Docker host already ships the `docker` binary; (3) the hardening
// flags (--cpus/--memory/--pids-limit/--read-only/--cap-drop/--network/--tmpfs)
// map 1:1 to CLI args, so the security posture is explicit and auditable in one
// place. We spawn `docker run -i` and speak MCP JSON-RPC over the container stdio.

import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import type { ExecutionSandboxPolicy } from '@uaip/types';

const execFileP = (cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    timer.unref?.();
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });

/** True when a working Docker daemon is reachable (`docker info`). */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const res = await execFileP('docker', ['info', '--format', '{{.ServerVersion}}'], 5000);
    return res.code === 0 && res.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export interface ContainerSpec {
  /** Unique container name (also the warm-pool key suffix). */
  name: string;
  /** Image to run; either the tool's prebuilt image or the generic runner. */
  image: string;
  /** MCP server entrypoint + args (run inside the runner image). */
  command?: string;
  args: string[];
  /** Non-secret env for the server. */
  env?: Record<string, string>;
  /** Per-call scoped credential (spec §4); injected as MCP_SCOPED_TOKEN. */
  scopedToken?: string;
  sandbox: ExecutionSandboxPolicy;
}

export interface ContainerHandle {
  name: string;
  child: ChildProcess;
  stdout: Readable;
  stdin: Writable;
  /** Kill the container process (SIGKILL) and `docker kill` by name as a backstop. */
  kill: () => void;
  /** Resolves when the container process exits. */
  waitExit: Promise<void>;
}

function buildRunArgs(spec: ContainerSpec): string[] {
  const s = spec.sandbox;
  const args: string[] = ['run', '--rm', '-i', '--name', spec.name];

  // Hard resource caps (spec §7).
  if (typeof s.cpu === 'number') args.push('--cpus', String(s.cpu));
  if (typeof s.memMb === 'number') args.push('--memory', `${s.memMb}m`);
  if (typeof s.pidsLimit === 'number') args.push('--pids-limit', String(s.pidsLimit));

  // Capability + privilege lockdown.
  args.push('--cap-drop', 'ALL');
  args.push('--security-opt', 'no-new-privileges');

  // Read-only rootfs + ephemeral writable scratch (tmpfs) so servers that need a
  // temp/home dir still work without a persistent, writable filesystem.
  if (s.readonlyRoot !== false) args.push('--read-only');
  args.push('--tmpfs', '/tmp:rw,noexec,nosuid,size=64m');
  args.push('--tmpfs', '/work:rw,nosuid,size=64m');
  args.push('-w', '/work');
  args.push('-e', 'HOME=/work');

  // Default-deny egress unless the tool declares a network (spec §7).
  const network = s.network && s.network !== 'none' ? s.network : 'none';
  args.push('--network', network);

  // Non-secret env, then the per-call scoped token.
  for (const [k, v] of Object.entries(spec.env ?? {})) {
    args.push('-e', `${k}=${v}`);
  }
  if (spec.scopedToken) args.push('-e', `MCP_SCOPED_TOKEN=${spec.scopedToken}`);

  args.push(spec.image);
  if (spec.command) args.push(spec.command);
  args.push(...spec.args);
  return args;
}

/** Start a hardened MCP container and return handles to its stdio. */
export function startContainer(spec: ContainerSpec): ContainerHandle {
  const runArgs = buildRunArgs(spec);
  const child = spawn('docker', runArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

  const kill = (): void => {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    // Backstop: the process pipe dying does not always stop the container.
    spawn('docker', ['kill', spec.name], { stdio: 'ignore' }).on('error', () => {});
  };

  const waitExit = new Promise<void>((resolve) => {
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });

  if (!child.stdin || !child.stdout) {
    throw new Error('docker run did not expose container stdio');
  }

  return { name: spec.name, child, stdout: child.stdout, stdin: child.stdin, kill, waitExit };
}
