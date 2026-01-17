#!/bin/bash
set -e

echo "Running formatting..."
pnpm format

echo "Running lint..."
pnpm lint

echo "Running type check..."
pnpm typecheck

echo "Running tests..."
pnpm test

echo "All checks passed!"
