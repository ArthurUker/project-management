#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting RDPMS services..."
echo ""

# Kill any existing processes
echo "🛑 Stopping existing services..."
pkill -f "vite" 2>/dev/null || true
pkill -f "node src/index.js" 2>/dev/null || true
pkill -f "nodemon src/index.js" 2>/dev/null || true
sleep 1

# Initialize backend database
echo "🗄️  Preparing database..."
cd backend
if command -v npx >/dev/null 2>&1; then
  npx prisma db push --accept-data-loss --skip-generate || true
else
  echo "⚠️  npx not found; skipping prisma db push"
fi

# Run seed if exists
if [ -f prisma/seed.js ]; then
  echo "🌱 Running database seed..."
  node prisma/seed.js || true
fi

# Start backend with nodemon
echo "📡 Starting backend (with nodemon)..."
npm run dev > "$SCRIPT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$SCRIPT_DIR/backend.pid"
sleep 2

# Start frontend
cd "$SCRIPT_DIR/frontend"
echo "🎨 Starting frontend (port 5173)..."
npm run dev -- --port 5173 --host > "$SCRIPT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$SCRIPT_DIR/frontend.pid"
sleep 2

echo ""
echo "================================"
echo "✅ Services started successfully!"
echo "================================"
echo ""
echo "Backend API:  http://localhost:3000"
echo "Frontend:     http://localhost:5173"
echo ""
echo "Backend PID:  $BACKEND_PID (saved in backend.pid)"
echo "Frontend PID: $FRONTEND_PID (saved in frontend.pid)"
echo ""
echo "📝 Logs:"
echo "  Backend:  $SCRIPT_DIR/backend.log"
echo "  Frontend: $SCRIPT_DIR/frontend.log"
echo ""
echo "🛑 To stop services: bash stop.sh"
