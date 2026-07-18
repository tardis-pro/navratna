import { type Agent, type PageContext, type BgResponse } from './messages';

const PANEL_ID = 'navratna-copilot-root';
let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let agents: Agent[] = [];
let selectedAgentId = '';

function send<T extends BgResponse>(msg: unknown): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r as T)));
}

function pageContext(): PageContext {
  return {
    id: crypto.randomUUID(),
    title: document.title,
    content: document.body.innerText.slice(0, 8000),
    type: 'webpage',
  };
}

const STYLES = `
:host { all: initial; }
.wrap { position: fixed; top: 0; right: 0; width: 380px; height: 100vh; z-index: 2147483647;
  font-family: system-ui, -apple-system, sans-serif; color: #e8ecf4;
  background: rgba(15,18,28,0.82); backdrop-filter: blur(18px);
  border-left: 1px solid rgba(255,255,255,0.12); box-shadow: -8px 0 40px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; transform: translateX(100%); transition: transform .25s ease; }
.wrap.open { transform: translateX(0); }
.hdr { padding: 14px 16px; display:flex; align-items:center; gap:10px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.dot { width: 9px; height: 9px; border-radius: 50%; background: linear-gradient(135deg,#5eead4,#818cf8); box-shadow: 0 0 10px #5eead4; }
.title { font-weight: 600; font-size: 14px; letter-spacing:.2px; flex:1; }
.x { cursor:pointer; opacity:.6; font-size:18px; line-height:1; } .x:hover{opacity:1;}
select, input, textarea, button { font: inherit; color: inherit; }
.bar { padding: 10px 14px; display:flex; gap:8px; border-bottom:1px solid rgba(255,255,255,0.08); }
select { flex:1; background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); border-radius:8px; padding:7px 9px; }
.actions { display:flex; gap:8px; padding: 10px 14px; flex-wrap:wrap; }
.pill { background: rgba(129,140,248,0.14); border:1px solid rgba(129,140,248,0.35); color:#c7d2fe;
  border-radius:999px; padding:6px 12px; font-size:12px; cursor:pointer; transition:.15s; }
.pill:hover { background: rgba(129,140,248,0.28); }
.log { flex:1; overflow-y:auto; padding: 12px 14px; display:flex; flex-direction:column; gap:10px; }
.msg { padding:9px 12px; border-radius:12px; font-size:13px; line-height:1.5; max-width:92%; white-space:pre-wrap; word-break:break-word; }
.user { align-self:flex-end; background: linear-gradient(135deg,#6366f1,#8b5cf6); }
.bot { align-self:flex-start; background: rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); }
.sys { align-self:center; font-size:11px; opacity:.6; }
.input { padding: 12px 14px; border-top:1px solid rgba(255,255,255,0.1); display:flex; gap:8px; }
textarea { flex:1; resize:none; height:44px; background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14);
  border-radius:10px; padding:10px 12px; font-size:13px; }
.snd { background: linear-gradient(135deg,#5eead4,#6366f1); border:none; border-radius:10px; padding:0 16px; cursor:pointer; font-weight:600; color:#0b0e16; }
.snd:disabled { opacity:.5; cursor:default; }
.login { padding: 24px; text-align:center; display:flex; flex-direction:column; gap:14px; align-items:center; }
.login button { background: linear-gradient(135deg,#5eead4,#6366f1); border:none; border-radius:10px; padding:10px 18px; cursor:pointer; font-weight:600; color:#0b0e16; }
.diff { background: rgba(94,234,212,0.08); border:1px solid rgba(94,234,212,0.3); border-radius:10px; padding:10px 12px; font-size:12px; }
.diff .row { display:flex; justify-content:space-between; gap:8px; padding:3px 0; }
.diff .k { opacity:.7; } .diff .v { color:#5eead4; text-align:right; word-break:break-all; }
.diff .btns { display:flex; gap:8px; margin-top:8px; }
.diff .btns button { flex:1; border-radius:8px; padding:6px; cursor:pointer; border:none; font-weight:600; }
.apply { background:#5eead4; color:#0b0e16; } .reject { background: rgba(255,255,255,0.12); color:#e8ecf4; }
`;

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild as HTMLElement;
}

function addMsg(kind: 'user' | 'bot' | 'sys', text: string): void {
  const log = shadow!.querySelector('.log')!;
  log.appendChild(el(`<div class="msg ${kind}"></div>`)).textContent = text;
  log.scrollTop = log.scrollHeight;
}

function visibleFormFields(): Array<{ el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; label: string }> {
  const nodes = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select'
    )
  );
  return nodes
    .filter((n) => n.offsetParent !== null && !n.disabled && !(n instanceof HTMLElement && 'readOnly' in n && (n as HTMLInputElement).readOnly))
    .map((n) => {
      const label =
        n.labels?.[0]?.innerText ||
        n.getAttribute('aria-label') ||
        n.getAttribute('placeholder') ||
        n.getAttribute('name') ||
        n.id ||
        'field';
      return { el: n, label: label.trim().slice(0, 60) };
    });
}

async function doFormFill(): Promise<void> {
  if (!selectedAgentId) return addMsg('sys', 'Pick an agent first.');
  const fields = visibleFormFields();
  if (fields.length === 0) return addMsg('sys', 'No fillable form fields found on this page.');
  addMsg('sys', `Analyzing ${fields.length} form fields…`);
  const spec = fields.map((f, i) => `${i}: "${f.label}"`).join('\n');
  const prompt =
    `You are filling a web form. Here are the fields by index:\n${spec}\n\n` +
    `Return ONLY a JSON object mapping field index (as string) to a suggested value string. ` +
    `Use realistic plausible values based on the field label. No prose, no markdown, JSON only.`;
  const res = await send<{ reply?: string; error?: string }>({
    type: 'CHAT',
    agentId: selectedAgentId,
    message: prompt,
    context: pageContext(),
  });
  if (res.error) return addMsg('sys', `Fill failed: ${res.error}`);
  let map: Record<string, string> = {};
  try {
    const m = res.reply?.match(/\{[\s\S]*\}/);
    map = m ? (JSON.parse(m[0]) as Record<string, string>) : {};
  } catch {
    return addMsg('sys', 'Could not parse AI suggestions.');
  }
  const entries = Object.entries(map).filter(([k]) => fields[Number(k)]);
  if (entries.length === 0) return addMsg('sys', 'No applicable suggestions returned.');
  renderDiff(entries, fields);
}

function renderDiff(
  entries: Array<[string, string]>,
  fields: Array<{ el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; label: string }>
): void {
  const log = shadow!.querySelector('.log')!;
  const rows = entries
    .map(([k, v]) => `<div class="row"><span class="k">${fields[Number(k)].label}</span><span class="v">${escapeHtml(v)}</span></div>`)
    .join('');
  const box = el(`<div class="diff"><div style="font-weight:600;margin-bottom:6px;">AI Fill preview</div>${rows}<div class="btns"><button class="apply">Apply</button><button class="reject">Dismiss</button></div></div>`);
  box.querySelector('.apply')!.addEventListener('click', () => {
    for (const [k, v] of entries) {
      const node = fields[Number(k)].el;
      node.value = v;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    }
    box.remove();
    addMsg('sys', `Applied ${entries.length} field values.`);
  });
  box.querySelector('.reject')!.addEventListener('click', () => box.remove());
  log.appendChild(box);
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function explainSelection(): Promise<void> {
  if (!selectedAgentId) return addMsg('sys', 'Pick an agent first.');
  const sel = window.getSelection()?.toString().trim();
  if (!sel) return addMsg('sys', 'Select some text on the page first, then click Explain.');
  addMsg('user', `Explain: "${sel.slice(0, 120)}${sel.length > 120 ? '…' : ''}"`);
  const res = await send<{ reply?: string; error?: string }>({
    type: 'CHAT',
    agentId: selectedAgentId,
    message: `Explain / summarize this selected text concisely:\n\n${sel}`,
    context: pageContext(),
  });
  if (res.error) return addMsg('sys', `Failed: ${res.error}`);
  addMsg('bot', res.reply || '(no response)');
}

async function sendChat(): Promise<void> {
  const ta = shadow!.querySelector('textarea') as HTMLTextAreaElement;
  const text = ta.value.trim();
  if (!text) return;
  if (!selectedAgentId) return addMsg('sys', 'Pick an agent first.');
  ta.value = '';
  addMsg('user', text);
  const btn = shadow!.querySelector('.snd') as HTMLButtonElement;
  btn.disabled = true;
  const res = await send<{ reply?: string; error?: string }>({
    type: 'CHAT',
    agentId: selectedAgentId,
    message: text,
    context: pageContext(),
  });
  btn.disabled = false;
  if (res.error) return addMsg('sys', `Error: ${res.error}`);
  addMsg('bot', res.reply || '(no response)');
}

async function buildPanel(): Promise<void> {
  host = document.createElement('div');
  host.id = PANEL_ID;
  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const auth = await send<{ authenticated: boolean }>({ type: 'AUTH_STATUS' });
  if (!auth.authenticated) {
    const wrap = el(`<div class="wrap open"><div class="hdr"><span class="dot"></span><span class="title">Navratna Copilot</span><span class="x">×</span></div><div class="login"><div>Sign in to use the copilot.</div><button>Log in at navratna.tardis.digital</button></div></div>`);
    wrap.querySelector('.x')!.addEventListener('click', togglePanel);
    wrap.querySelector('.login button')!.addEventListener('click', () => send({ type: 'OPEN_LOGIN' }));
    shadow.appendChild(wrap);
    document.body.appendChild(host);
    return;
  }

  const wrap = el(`<div class="wrap open">
    <div class="hdr"><span class="dot"></span><span class="title">Navratna Copilot</span><span class="x">×</span></div>
    <div class="bar"><select><option value="">Loading agents…</option></select></div>
    <div class="actions"><span class="pill" data-a="fill">AI Fill Form</span><span class="pill" data-a="explain">Explain Selection</span></div>
    <div class="log"></div>
    <div class="input"><textarea placeholder="Ask about this page…"></textarea><button class="snd">Send</button></div>
  </div>`);
  wrap.querySelector('.x')!.addEventListener('click', togglePanel);
  wrap.querySelector('.snd')!.addEventListener('click', sendChat);
  wrap.querySelector('textarea')!.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
  wrap.querySelectorAll('.pill').forEach((p) =>
    p.addEventListener('click', () => {
      const a = (p as HTMLElement).dataset.a;
      if (a === 'fill') doFormFill();
      else if (a === 'explain') explainSelection();
    })
  );
  shadow.appendChild(wrap);
  document.body.appendChild(host);

  const list = await send<{ agents: Agent[]; error?: string }>({ type: 'LIST_AGENTS' });
  agents = list.agents;
  const select = shadow.querySelector('select') as HTMLSelectElement;
  if (list.error || agents.length === 0) {
    select.innerHTML = `<option value="">${list.error ? 'Failed to load agents' : 'No agents'}</option>`;
  } else {
    const stored = (await chrome.storage.local.get('agentId')).agentId as string | undefined;
    selectedAgentId = stored && agents.some((a) => a.id === stored) ? stored : agents[0].id;
    select.innerHTML = agents.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    select.value = selectedAgentId;
    addMsg('sys', 'Ask about this page, fill a form, or explain a selection.');
  }
  select.addEventListener('change', () => {
    selectedAgentId = select.value;
    chrome.storage.local.set({ agentId: selectedAgentId });
  });
}

function togglePanel(): void {
  if (!host) {
    buildPanel();
    return;
  }
  const wrap = shadow!.querySelector('.wrap')!;
  wrap.classList.toggle('open');
}

chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg.type === 'TOGGLE_PANEL') togglePanel();
});
