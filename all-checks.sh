#!/bin/bash
set -e

echo "===== Running check.sh ====="
./check.sh

echo ""
echo "===== Running health.sh ====="
./health.sh

echo ""
echo "All checks completed successfully!"
