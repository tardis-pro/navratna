# Canva Integration Setup (PM-22)

## Prerequisites

- A Canva account (free or Teams)
- Access to the [Canva Developer Portal](https://www.canva.com/developers/)

---

## Step 1: Create a Canva Developer App

1. Sign in to [developer.canva.com](https://www.canva.com/developers/)
2. Click **Create app**
3. Fill in:
   - **App name**: Navratna AI (or your brand name)
   - **Short description**: AI-powered design generation
   - **Integration type**: Connect apps
4. Under **OAuth 2.0 settings**, add your redirect URI:
   - Dev: `http://localhost:3002/api/v1/canva/oauth/callback`
   - Staging/Production: `https://your-domain.com/api/v1/canva/oauth/callback`
5. Enable the following **scopes**:
   - `design:meta:read`
   - `design:content:read`
   - `design:content:write`
   - `asset:read`
   - `asset:write`
   - `brandtemplate:content:read`
   - `brandtemplate:meta:read`
6. Save and note your **Client ID** and **Client Secret**

---

## Step 2: Configure Environment Variables

Add to your `.env` file (see `sample.env` for all vars):

```env
CANVA_CLIENT_ID=<your-client-id>
CANVA_CLIENT_SECRET=<your-client-secret>
CANVA_REDIRECT_URI=http://localhost:3002/api/v1/canva/oauth/callback
```

---

## Step 3: OAuth Flow

The integration uses standard OAuth 2.0 Authorization Code flow.

### Initiate authorization

```http
GET /api/v1/canva/oauth/authorize
Authorization: Bearer <navratna-jwt>
```

Response:
```json
{ "success": true, "url": "https://www.canva.com/api/oauth/authorize?client_id=...&..." }
```

Redirect the user to `url`. After the user approves, Canva redirects to your `CANVA_REDIRECT_URI` with `code` and `state` query params.

### Handle callback

```http
GET /api/v1/canva/oauth/callback?code=AUTH_CODE&state=STATE
Authorization: Bearer <navratna-jwt>
```

Tokens are returned in the response. Store the `access_token` securely — pass it as `X-Canva-Access-Token` header for all subsequent tool calls.

---

## Step 4: Use MCP Tools

All tool endpoints require two headers:
- `Authorization: Bearer <navratna-jwt>`
- `X-Canva-Access-Token: <canva-access-token>`

### List available tools

```http
GET /api/v1/canva/tools
```

### Create a design

```http
POST /api/v1/canva/tools/create-design
Content-Type: application/json

{
  "template_id": "DAGFa7zKQ8c",
  "title": "Q2 Campaign Banner",
  "content_json": { "headline": "Transform your workflow" }
}
```

### List templates

```http
GET /api/v1/canva/tools/list-templates?category=social_media&limit=10
```

### Export a design

```http
POST /api/v1/canva/tools/export-design
Content-Type: application/json

{
  "design_id": "DAGFa7zKQ8c",
  "format": "png"
}
```

Formats: `png` | `pdf` | `mp4`. Export is asynchronous — the adapter polls for completion (up to 30 seconds).

### Update Brand Kit

```http
POST /api/v1/canva/tools/update-brand-kit
Content-Type: application/json

{
  "brand_kit_data": {
    "name": "ACME Brand",
    "colors": [{ "name": "Primary Blue", "color": "#0055FF" }]
  }
}
```

---

## Deployment Blockers

See `docs/orphan-bugs/deferred/PM-22-deployment-blockers.md` for outstanding items before full production deployment.
