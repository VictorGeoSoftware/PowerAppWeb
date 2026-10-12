#!/usr/bin/env bash
set -euo pipefail

echo "Repository: $(pwd)"

if [ ! -f package.json ]; then
  echo "Harness status: pre-bootstrap"
  echo "Application stack is not initialized yet (Next.js + Tailwind + shadcn + Firebase JS SDK)."
  echo "Next step: implement feature 'bootstrap-nextjs-app' from feature_list.json."
  echo "Expected future commands: npm ci && npm run lint && npm run typecheck && npm test"
  exit 0
fi

echo "Installing dependencies..."
npm ci

echo "Running baseline verification..."
npm run lint
npm run typecheck
npm test

echo "Start dev server with: npm run dev"
if [ "${RUN_START_COMMAND:-0}" = "1" ]; then
  exec npm run dev
fi
