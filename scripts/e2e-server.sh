#!/usr/bin/env bash
set -euo pipefail

E2E_DIR="$(mktemp -d)"
trap 'rm -rf "$E2E_DIR"' EXIT

export DATABASE_URL="file:$E2E_DIR/valhalla-e2e.db"
export SESSION_SECRET="valhalla-e2e-session-secret-with-at-least-32-characters"
export SESSION_COOKIE_SECURE="false"
export NEXT_PUBLIC_APP_URL="http://127.0.0.1:3100"

npx prisma migrate deploy
npm run prisma:seed
npm run build
PORT=3100 npm run start
