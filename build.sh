#!/bin/bash
set -e

echo "=== Python dependencies ==="
pip install -r requirements.txt

echo "=== Frontend build ==="
cd ertagro-platform/frontend
npm install
npm run build

echo "=== Copy static files ==="
cd ../..
mkdir -p frontend_dist
cp -r ertagro-platform/frontend/out/* frontend_dist/

echo "=== Build complete ==="
