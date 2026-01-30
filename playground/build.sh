#!/bin/bash
# Build playground and update gateway
# Usage: ./build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building playground..."
npm run build

echo ""
echo "Build complete! Files in: $SCRIPT_DIR/dist/"
echo ""
echo "If gateway is running, restart it to see changes:"
echo "  cd pobut_pro/backend_new && docker-compose restart gateway"
