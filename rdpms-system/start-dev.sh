#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "Stopping existing vite/backend processes (if any)"
pkill -f "vite" || true
pkill -f "node src/index.js" || true
sleep 0.4

echo "-> Pushing Prisma schema"
cd backend
if command -v npx >/dev/null 2>&1; then
  npx prisma db push --accept-data-loss || true
else
  echo "npx not found; skipping prisma db push"
fi

# Run seed (if exists)
if [ -f prisma/seed.js ]; then
  echo "-> Running seed"
  node prisma/seed.js || true
fi

# Start backend
echo "-> Starting backend"
nohup node src/index.js > backend.log 2>&1 &
echo $! > backend.pid
sleep 0.6

# Start frontend on fixed port 5173
cd ../frontend
echo "-> Starting frontend (port 5173)"
nohup npm run dev -- --port 5173 --host > frontend.log 2>&1 &
echo $! > frontend.pid
sleep 1

# Show listening ports
echo "--- Listening ports (3000/5173) ---"
lsof -iTCP -sTCP:LISTEN -n -P | grep -E "3000|5173" || true

# Quick health checks
echo "--- Health checks ---"
curl -sS -I http://127.0.0.1:3000 || true
curl -sS -I http://127.0.0.1:5173 || true

echo "Started. Check backend.log and frontend.log for details. To stop: kill \\$(cat backend/backend.pid) || true; kill \\$(cat frontend/frontend.pid) || true"
