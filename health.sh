#!/bin/bash
set -e

echo "Checking for secrets with gitleaks..."
gitleaks git --verbose

echo "Checking for outdated dependencies..."
pnpm outdated

echo "Checking for vulnerabilities..."
pnpm audit --audit-level=moderate

echo "All health checks passed!"
