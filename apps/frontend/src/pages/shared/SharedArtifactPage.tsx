import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { fetchSharedArtifact, type SharedArtifact } from '@/api/artifact_share';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; artifact: SharedArtifact }
  | { status: 'not-found' }
  | { status: 'expired' }
  | { status: 'error' };

/**
 * Public, unauthenticated read-only view of a shared artifact. Rendered outside
 * ProtectedRoute so a peer following a share link sees the content directly with
 * no login wall — the outward-facing half of the share loop.
 */
export default function SharedArtifactPage() {
  const { shortCode } = useParams<{ shortCode: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (!shortCode) {
      setState({ status: 'not-found' });
      return;
    }
    fetchSharedArtifact(shortCode)
      .then((artifact) => {
        if (!cancelled) setState({ status: 'ready', artifact });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : '';
        if (message === 'NOT_FOUND') setState({ status: 'not-found' });
        else if (message === 'EXPIRED') setState({ status: 'expired' });
        else setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [shortCode]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {state.status === 'loading' && (
          <p className="text-slate-400">Loading shared artifact…</p>
        )}

        {state.status === 'not-found' && (
          <Notice title="Not found" body="This shared artifact does not exist or is no longer available." />
        )}

        {state.status === 'expired' && (
          <Notice title="Link expired" body="This share link has expired." />
        )}

        {state.status === 'error' && (
          <Notice title="Something went wrong" body="We couldn't load this artifact. Try again later." />
        )}

        {state.status === 'ready' && <ArtifactView artifact={state.artifact} />}

        <footer className="mt-12 border-t border-slate-800 pt-4 text-xs text-slate-500">
          Shared via{' '}
          <a href="/" className="text-cyan-400 hover:text-cyan-300">
            Navratna
          </a>
        </footer>
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <h1 className="text-lg font-medium">{title}</h1>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
    </div>
  );
}

function ArtifactView({ artifact }: { artifact: SharedArtifact }) {
  return (
    <article>
      <div className="mb-4">
        <span className="inline-block rounded bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
          {artifact.type}
          {artifact.language ? ` · ${artifact.language}` : ''}
        </span>
      </div>
      <h1 className="text-2xl font-semibold">{artifact.title}</h1>
      {artifact.description && (
        <p className="mt-2 text-slate-400">{artifact.description}</p>
      )}
      {artifact.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {artifact.tags.map((tag) => (
            <span key={tag} className="rounded bg-slate-800/70 px-1.5 py-0.5 text-xs text-slate-400">
              {tag}
            </span>
          ))}
        </div>
      )}
      <pre className="mt-6 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm leading-relaxed">
        <code>{artifact.content}</code>
      </pre>
    </article>
  );
}
