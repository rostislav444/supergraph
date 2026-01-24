#!/bin/bash
# Build the Playground frontend and bundle it with the Python package.
#
# Usage:
#   ./scripts/build_playground.sh
#
# This script:
#   1. Builds the React playground with Vite
#   2. Copies the dist folder to src/supergraph/playground/dist
#   3. The dist is then included in the Python wheel during packaging

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PLAYGROUND_DIR="$PROJECT_ROOT/playground"
DIST_TARGET="$PROJECT_ROOT/src/supergraph/playground/dist"

echo "=== Building Supergraph Playground ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# Check if playground directory exists
if [ ! -d "$PLAYGROUND_DIR" ]; then
    echo "Error: Playground directory not found at $PLAYGROUND_DIR"
    exit 1
fi

# Build the frontend
echo "1. Installing dependencies..."
cd "$PLAYGROUND_DIR"
npm ci --silent

echo "2. Building React app..."
npm run build

# Copy dist to package
echo "3. Copying dist to package..."
rm -rf "$DIST_TARGET"
mkdir -p "$(dirname "$DIST_TARGET")"
cp -r "$PLAYGROUND_DIR/dist" "$DIST_TARGET"

# Verify
if [ -f "$DIST_TARGET/index.html" ]; then
    echo ""
    echo "=== Build successful! ==="
    echo "Bundled at: $DIST_TARGET"
    echo ""
    echo "Contents:"
    ls -la "$DIST_TARGET"
else
    echo "Error: Build failed - index.html not found"
    exit 1
fi
