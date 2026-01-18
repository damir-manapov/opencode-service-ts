# OpenCode Service - Design Document

## Overview

OpenCode-as-a-Service: A stateless, multi-tenant HTTP service that provides OpenCode capabilities without requiring users to manage infrastructure.

**Key principles:**
- No files saved on server side (except tenant config and sessions)
- All configuration generated on the fly from tenant settings
- Users bring their own tools, agents, provider credentials
- Predefined tools/agents available from service

---

## Architecture

```
Client Request
    │
    ▼
┌─────────────────────────────────────┐
│         OpenCode Service            │
│  ┌─────────────────────────────┐    │
│  │   Auth (token → tenantId)   │    │
│  └─────────────────────────────┘    │
│              │                      │
│              ▼                      │
│  ┌─────────────────────────────┐    │
│  │   Load Tenant Config        │    │
│  │   (JSON files)              │    │
│  └─────────────────────────────┘    │
│              │                      │
│              ▼                      │
│  ┌─────────────────────────────┐    │
│  │   Generate Workspace        │    │
│  │   - .opencode/tool/*.ts     │    │
│  │   - .opencode/agent/*.md    │    │
│  │   - opencode.json           │    │
│  └─────────────────────────────┘    │
│              │                      │
│              ▼                      │
│  ┌─────────────────────────────┐    │
│  │   Inject Secrets (env)      │    │
│  └─────────────────────────────┘    │
│              │                      │
│              ▼                      │
│  ┌─────────────────────────────┐    │
│  │   Execute OpenCode          │    │
│  │   (SDK + temp workspace)    │    │
│  └─────────────────────────────┘    │
│              │                      │
│              ▼                      │
│  ┌─────────────────────────────┐    │
│  │   Stream Response           │    │
│  └─────────────────────────────┘    │
│              │                      │
│              ▼                      │
│  ┌─────────────────────────────┐    │
│  │   Cleanup (if stateless)    │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

---

## Authentication

### Token Format

```
ocs_{tenantId}_{secret}
```

Example: `ocs_acme_EXAMPLE_TOKEN5f6g7h8`

- Prefix `ocs_` identifies OpenCode Service tokens
- TenantId embedded in token (not in URL path)
- Multiple tokens per tenant for rotation
- Service generates tokens

### Token Parsing

```typescript
function parseToken(authHeader: string): { tenantId: string; secret: string } | null {
  const match = authHeader.match(/^Bearer ocs_([^_]+)_(.+)$/);
  if (!match) return null;
  return { tenantId: match[1], secret: match[2] };
}
```

### Admin Authentication

- Separate admin tokens from environment variable
- Multiple admin tokens supported (comma-separated)
- Used for tenant management endpoints

---

## Data Storage (MVP: JSON Files)

```
data/
├── tenants/
│   └── {tenantId}/
│       ├── config.json         # Tenant configuration
│       ├── secrets.env         # Environment secrets (gitignored)
│       ├── tools/
│       │   └── *.ts            # Custom TypeScript tools
│       └── agents/
│           └── *.md            # Custom agent definitions
└── sessions/
    └── {sessionId}/
        ├── session.json        # Session metadata
        └── .opencode/          # OpenCode working directory
```

### Tenant Config Schema

```typescript
interface TenantConfig {
  id: string;
  name: string;
  tokens: string[];              // Secret parts only (e.g., "sk_a1b2c3...")

  providers: {
    [providerId: string]: {
      apiKey: string;
      baseUrl?: string;
    };
  };
  
  defaultModel?: {
    providerId: string;
    modelId: string;
  };
  
  includePredefined?: {
    tools?: string[];            // e.g., ["http", "websearch"]
    agents?: string[];
  };
  
  createdAt: string;
  updatedAt: string;
}
```

### Secrets File Format

```env
# data/tenants/{tenantId}/secrets.env
DB_URL=postgres://user:pass@host:5432/db
SOME_API_KEY=xxx
```

---

## Session Management

### Modes

1. **Stateless**: No sessionId provided
   - Temp workspace created
   - Deleted after response

2. **Session-based**: SessionId provided
   - Workspace persisted in `data/sessions/{sessionId}/`
   - Reused for subsequent requests
   - TTL-based cleanup

### Session Metadata

```typescript
interface SessionMeta {
  id: string;
  tenantId: string;
  createdAt: string;
  lastAccessedAt: string;
}
```

### Session TTL

- Configurable via `SESSION_TTL` env (default: `24h`)
- Format: `<number><unit>` where unit is `m` (minutes), `h` (hours), or `d` (days)
- Examples: `30m`, `24h`, `7d`
- Cleanup: lazy (on access) or scheduled (cron)

---

## API Endpoints

### Chat Completions (OpenAI-Compatible)

```
POST /v1/chat/completions
Authorization: Bearer ocs_{tenantId}_{secret}
Content-Type: application/json

{
  "model": "anthropic/claude-sonnet",  // Required: "provider/model" format
  "messages": [
    { "role": "system", "content": "You are a helpful assistant" },
    { "role": "user", "content": "Query the database" }
  ],
  "stream": false,                     // Optional: enable SSE streaming
  "temperature": 0.7,                  // Optional: sampling temperature
  "max_tokens": 4096,                  // Optional: max output tokens
  "tools": [                           // Optional: OpenAI function definitions
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather",
        "parameters": { "type": "object", "properties": {...} }
      }
    }
  ],
  "tool_choice": "auto"                // Optional: "none", "auto", "required"
}
```

#### Response (Non-Streaming)

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1737475200,
  "model": "anthropic/claude-sonnet",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Here are the database results...",
        "tool_calls": null
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 150,
    "total_tokens": 200
  }
}
```

#### Response (Streaming)

Server-Sent Events (SSE) format:

```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1737475200,"model":"anthropic/claude-sonnet","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1737475200,"model":"anthropic/claude-sonnet","choices":[{"index":0,"delta":{"content":"Here"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1737475200,"model":"anthropic/claude-sonnet","choices":[{"index":0,"delta":{"content":" are"},"finish_reason":null}]}

data: [DONE]
```

#### Model Format

Models are specified as `provider/model`:
- `anthropic/claude-sonnet-4-20250514`
- `openai/gpt-4o`
- `google/gemini-pro`

The provider must be configured in tenant's provider settings.

### List Models (OpenAI-Compatible)

```
GET /v1/models
Authorization: Bearer ocs_{tenantId}_{secret}
```

#### Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "anthropic/claude-sonnet-4-20250514",
      "object": "model",
      "created": 1737475200,
      "owned_by": "anthropic"
    },
    {
      "id": "anthropic/claude-opus-4-20250514",
      "object": "model",
      "created": 1737475200,
      "owned_by": "anthropic"
    }
  ]
}
```

Returns models available to the tenant based on their configured providers.

### Session Management

```
DELETE /v1/sessions/{sessionId}
Authorization: Bearer ocs_{tenantId}_{secret}
```

### Tenant Self-Management

```
GET    /v1/tenant                      # Get own config (minus secrets)
PUT    /v1/tenant                      # Update config

GET    /v1/tenant/tools                # List tools
GET    /v1/tenant/tools/{name}         # Get tool source
PUT    /v1/tenant/tools/{name}         # Upload tool (TypeScript source)
DELETE /v1/tenant/tools/{name}         # Delete tool

GET    /v1/tenant/agents               # List agents
GET    /v1/tenant/agents/{name}        # Get agent content
PUT    /v1/tenant/agents/{name}        # Upload agent
DELETE /v1/tenant/agents/{name}        # Delete agent

GET    /v1/tenant/secrets              # List secret names only (not values)
PUT    /v1/tenant/secrets              # Update secrets
POST   /v1/tenant/tokens               # Generate new token
DELETE /v1/tenant/tokens/{secret}      # Revoke token
```

### Admin Endpoints

```
Authorization: Bearer {ADMIN_TOKEN}

POST   /v1/admin/tenants               # Create tenant (returns first token)
GET    /v1/admin/tenants               # List tenants
GET    /v1/admin/tenants/{id}          # Get tenant
DELETE /v1/admin/tenants/{id}          # Delete tenant
```

### Self-Registration (Optional)

```
POST /v1/register                      # Only if ALLOW_SELF_REGISTRATION=true
Content-Type: application/json

{
  "name": "ACME Corp",
  "email": "admin@acme.com"           // Optional
}

# Response: { "tenantId": "acme", "token": "ocs_acme_sk_..." }
```

### Predefined Resources

```
GET /v1/predefined/tools               # List available predefined tools
GET /v1/predefined/tools/{name}        # Get predefined tool source
GET /v1/predefined/agents              # List available predefined agents
GET /v1/predefined/agents/{name}       # Get predefined agent content
```

---

## Environment Variables

```bash
# Required
ADMIN_TOKENS=admin_token1,admin_token2    # Comma-separated for rotation

# Optional
PORT=3000
DATA_DIR=./data
PREDEFINED_DIR=./predefined
SESSION_TTL=24h                            # Format: 30m, 24h, 7d
ALLOW_SELF_REGISTRATION=false             # Enable POST /v1/register
```

---

## Predefined Resources

```
predefined/
├── tools/
│   ├── http.ts              # Generic HTTP requests
│   ├── websearch.ts         # Web search
│   └── ...
└── agents/
    └── default.md           # Default agent
```

---

## Workspace Generation

For each request, generate temporary `.opencode/` structure:

```typescript
async function generateWorkspace(
  tenantConfig: TenantConfig,
  tenantSecrets: Record<string, string>,
  request: ChatRequest,
  workspacePath: string
): Promise<void> {
  // 1. Create .opencode/tool/ with:
  //    - Tenant's custom tools
  //    - Requested predefined tools
  //    - Request-specific tools (if any)
  
  // 2. Create .opencode/agent/ with:
  //    - Tenant's custom agents
  //    - Requested predefined agents
  
  // 3. Generate opencode.json with:
  //    - Provider configs from tenant
  //    - Model selection
  
  // 4. Set environment variables from secrets
}
```

---

## File Structure in Repository

```
aloyal-opencode/
├── src/
│   ├── opencode-service/
│   │   ├── server.ts                 # Express HTTP server
│   │   ├── routes/
│   │   │   ├── chat.ts               # POST /v1/chat
│   │   │   ├── tenant.ts             # Tenant self-management
│   │   │   ├── admin.ts              # Admin endpoints
│   │   │   ├── sessions.ts           # Session cleanup
│   │   │   └── predefined.ts         # List predefined resources
│   │   ├── services/
│   │   │   ├── auth.ts               # Token parsing & validation
│   │   │   ├── tenant-store.ts       # Tenant CRUD (JSON files)
│   │   │   ├── session-manager.ts    # Session lifecycle
│   │   │   ├── workspace-generator.ts
│   │   │   ├── opencode-executor.ts  # Run OpenCode
│   │   │   └── token-generator.ts    # Generate secure tokens
│   │   ├── middleware/
│   │   │   ├── auth.ts               # Auth middleware
│   │   │   └── admin-auth.ts         # Admin auth middleware
│   │   └── types.ts
│   └── ... (existing code)
├── predefined/
│   ├── tools/
│   └── agents/
├── data/                             # Gitignored
│   ├── tenants/
│   └── sessions/
└── docs/
    └── opencode-service-design.md    # This file
```

---

## Security Considerations (MVP)

### MVP (Acceptable)
- Secrets stored in plain `.env` files (gitignored)
- TypeScript tools executed without sandboxing
- Trust tenants not to provide malicious code

### Future Improvements
- Encrypted secrets storage
- Tool execution in isolated containers
- Rate limiting per tenant
- Audit logging

---

## Implementation Phases

### Phase 1: Core Chat
1. Token auth parsing
2. Tenant config loading (manual JSON creation)
3. Workspace generation
4. OpenCode execution
5. Streaming response
6. Stateless cleanup

### Phase 2: Admin API
1. Tenant CRUD
2. Token generation
3. Admin auth

### Phase 3: Tenant Self-Service
1. Tool/agent upload
2. Secrets management
3. Token rotation

### Phase 4: Sessions
1. Session persistence
2. Session cleanup (TTL)

### Phase 5: Containerization
1. Dockerfile
2. Docker Compose
3. Tool sandboxing

---

## Example Usage

### Create Tenant (Admin)

```bash
curl -X POST http://localhost:3000/v1/admin/tenants \
  -H "Authorization: Bearer admin_secret" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "acme",
    "name": "ACME Corp",
    "providers": {
      "anthropic": { "apiKey": "sk-ant-..." }
    },
    "defaultModel": {
      "providerId": "anthropic",
      "modelId": "claude-sonnet"
    }
  }'

# Response: { "token": "ocs_acme_EXAMPLE_TOKEN" }
```

### Chat Request (OpenAI-Compatible)

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer ocs_acme_EXAMPLE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet",
    "messages": [
      { "role": "user", "content": "Hello, what tools do you have?" }
    ],
    "stream": false
  }'

# Response:
# {
#   "id": "chatcmpl-abc123",
#   "object": "chat.completion",
#   "created": 1737475200,
#   "model": "anthropic/claude-sonnet",
#   "choices": [{
#     "index": 0,
#     "message": { "role": "assistant", "content": "I have access to..." },
#     "finish_reason": "stop"
#   }]
# }
```

### Streaming Chat Request

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer ocs_acme_EXAMPLE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet",
    "messages": [
      { "role": "user", "content": "Write a haiku" }
    ],
    "stream": true
  }'

# Response (SSE):
# data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"delta":{"content":"Silent"}}]}
# data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"delta":{"content":" code"}}]}
# ...
# data: [DONE]
```

### Upload Custom Tool

```bash
curl -X PUT http://localhost:3000/v1/tenant/tools/my-db-tool \
  -H "Authorization: Bearer ocs_acme_EXAMPLE_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary @my-db-tool.ts
```
