#!/bin/bash
set -e

echo "Running biome check (format + lint)..."
pnpm check

echo "Running type check..."
pnpm typecheck

echo "Running tests..."
pnpm test

echo "All checks passed!"
