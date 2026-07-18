import {
  API_BASE,
  APP_ORIGIN,
  type BgRequest,
  type Agent,
  type PageContext,
} from './messages';

async function getToken(): Promise<string | null> {
  const cookie = await chrome.cookies.get({ url: APP_ORIGIN, name: 'access_token' });
  return cookie?.value ?? null;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function listAgents(): Promise<{ agents: Agent[]; error?: string }> {
  try {
    const resp = await authedFetch('/api/v1/agents', { method: 'GET' });
    if (!resp.ok) return { agents: [], error: `HTTP ${resp.status}` };
    const json = (await resp.json()) as { data?: unknown };
    const raw = Array.isArray(json.data) ? json.data : [];
    const agents: Agent[] = raw
      .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
      .map((a) => ({ id: String(a.id ?? ''), name: String(a.name ?? 'Agent') }))
      .filter((a) => a.id);
    return { agents };
  } catch (err) {
    return { agents: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function chat(
  agentId: string,
  message: string,
  context?: PageContext
): Promise<{ reply?: string; error?: string }> {
  try {
    const resp = await authedFetch(`/api/v1/agents/${encodeURIComponent(agentId)}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, context }),
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const json = (await resp.json()) as { data?: { response?: string; content?: string } };
    return { reply: json.data?.response ?? json.data?.content ?? '' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

chrome.runtime.onMessage.addListener((msg: BgRequest, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'AUTH_STATUS':
        sendResponse({ authenticated: (await getToken()) !== null });
        break;
      case 'LIST_AGENTS':
        sendResponse(await listAgents());
        break;
      case 'CHAT':
        sendResponse(await chat(msg.agentId, msg.message, msg.context));
        break;
      case 'OPEN_LOGIN':
        await chrome.tabs.create({ url: APP_ORIGIN });
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ error: 'unknown message' });
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
});
