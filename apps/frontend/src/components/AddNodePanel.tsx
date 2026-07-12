/**
 * AddNodePanel — the "Add a node" quick step.
 *
 * Register your OWN docker container / EC2 box as a Navratna compute node so
 * steps run on a machine that actually has the deps. Mint a token, copy the
 * one-liner, and watch the node come online with what it advertised it can run.
 */

import { useCallback, useEffect, useState } from 'react';
import { nodesAPI, type MeshNode, type NodeEnrollmentToken } from '@/api/nodes_api';

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</span>
        <button
          onClick={copy}
          className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-100 hover:bg-gray-600"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto rounded bg-black/60 p-3 text-xs text-green-300">{value}</pre>
    </div>
  );
}

function HealthDot({ health }: { health: MeshNode['health'] }) {
  const color =
    health === 'ready'
      ? 'bg-green-500'
      : health === 'degraded'
        ? 'bg-yellow-500'
        : health === 'draining'
          ? 'bg-orange-500'
          : 'bg-red-500';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} title={health} />;
}

export function AddNodePanel() {
  const [token, setToken] = useState<NodeEnrollmentToken | null>(null);
  const [nodes, setNodes] = useState<MeshNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await nodesAPI.listNodes();
      setNodes(result.nodes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval((): void => {
      void refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const mint = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setToken(await nodesAPI.mintToken());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-6 text-gray-100">
      <h2 className="mb-1 text-xl font-semibold">Add a compute node</h2>
      <p className="mb-4 text-sm text-gray-400">
        Register your own Docker container or EC2 instance so your steps run on a machine that has
        the dependencies. Mint a token, run one command, and it appears below.
      </p>

      <button
        onClick={mint}
        disabled={loading}
        className="mb-4 rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? 'Minting…' : 'Generate registration command'}
      </button>

      {error && <div className="mb-4 rounded bg-red-900/40 p-2 text-sm text-red-300">{error}</div>}

      {token && (
        <div className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4">
          <p className="mb-3 text-sm text-gray-300">
            Node id <code className="text-indigo-300">{token.nodeId}</code> — token valid for{' '}
            {Math.round(token.expiresInSec / 60)} min (single use).
          </p>
          <CopyBlock label="Run this on your machine (Docker)" value={token.dockerRun} />
          <CopyBlock label="Or bootstrap a fresh EC2 / VM" value={token.curlBootstrap} />
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
        Your nodes
      </h3>
      {nodes.length === 0 ? (
        <p className="text-sm text-gray-500">No nodes yet. Run the command above to add one.</p>
      ) : (
        <ul className="space-y-2">
          {nodes.map((n) => (
            <li key={n.id} className="rounded border border-gray-700 bg-gray-900/40 p-3">
              <div className="flex items-center gap-2">
                <HealthDot health={n.health} />
                <span className="font-mono text-sm">{n.id}</span>
                {n.tier && (
                  <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs">{n.tier}</span>
                )}
                <span className="text-xs text-gray-500">{n.runtime}</span>
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Can execute:{' '}
                {n.runtimes.length ? (
                  n.runtimes.map((r) => (
                    <span key={r} className="mr-1 rounded bg-green-900/40 px-1.5 py-0.5 text-green-300">
                      {r}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500">not reported</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AddNodePanel;
