# OpenCode Service

Multi-tenant OpenCode-as-a-Service HTTP API. Provides OpenCode capabilities without requiring users to manage infrastructure.

## Features

- Multi-tenant with token-based authentication
- Stateless and session-based execution modes
- Custom tools and agents per tenant
- Predefined tools and agents
- Real-time streaming responses
- Provider credential management per tenant

## Prerequisites

- Node.js >= 20.0.0
- pnpm
- gitleaks (for security checks)

### Installing gitleaks

```bash
# macOS
brew install gitleaks

# Linux - download from releases
# https://github.com/gitleaks/gitleaks/releases
```

## Installation

```bash
pnpm install
```

## Development

```bash
# Run in development mode with watch
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start
```

## Scripts

```bash
# Run unit tests
pnpm test

# Run unit tests in watch mode
pnpm test:watch

# Run e2e tests (auto-starts server)
pnpm test:e2e

# Run all tests (unit + e2e)
pnpm test:all

# Lint and format (auto-fix)
pnpm check

# Lint and format (check only, no fix)
pnpm check:only

# Lint only (auto-fix)
pnpm lint

# Format only (auto-fix)
pnpm format

# Type check
pnpm typecheck

# Run all checks (biome, types, tests)
./check.sh

# Run health checks (gitleaks, outdated deps, vulnerabilities)
./health.sh

# Run everything
./all-checks.sh
```

## Environment Variables

```bash
# Required
ADMIN_TOKENS=admin_token1,admin_token2    # Comma-separated for rotation

# Optional
PORT=3000
DATA_DIR=./data
PREDEFINED_DIR=./predefined
SESSION_TTL=24h                            # Format: 30m, 24h, 7d
IDLE_TIMEOUT=5m                            # Per-tenant OpenCode instance timeout
ALLOW_SELF_REGISTRATION=false
```

## API Documentation

See [docs/design.md](docs/design.md) for full API documentation.

### Quick Start

1. Create a tenant (admin):

```bash
curl -X POST http://localhost:3000/v1/admin/tenants \
  -H "Authorization: Bearer admin_token1" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Tenant", "providers": {"anthropic": {"apiKey": "sk-..."}}}'
```

2. Use the returned token for chat:

```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "Authorization: Bearer ocs_mytenant_sk_..." \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```
