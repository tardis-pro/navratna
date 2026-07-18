# Navratna Copilot (browser extension)

Interactive AI copilot (Chrome MV3): chat about any page, fill forms with AI assistance, and explain/annotate on-screen selections. Talks to the Navratna backend as the logged-in user.

## Build

```bash
cd apps/extension
pnpm install
pnpm build      # → apps/extension/dist/
```

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `apps/extension/dist/`
4. Sign in at https://navratna.tardis.digital in the same browser (the extension reuses that session's `access_token` cookie).
5. Open the panel: click the extension icon or press **Alt+Shift+A**.

## How it works

- **Auth**: background service worker reads the `access_token` cookie from `navratna.tardis.digital` and sends it as `Authorization: Bearer` — no CSRF, no cookie-CORS.
- **CORS**: all API calls run in the background service worker (no `Origin` header → not CORS-evaluated). Content scripts only touch the DOM and message the worker.
- **Endpoints**: `GET /api/v1/agents`, `POST /api/v1/agents/:id/chat` (with page context).

## Features

- **Chat** — ask about the current page; page title + text are sent as context.
- **AI Fill Form** — scans visible form fields, asks the agent for values, previews a diff, applies on accept.
- **Explain Selection** — select text on the page, get a concise explanation.
