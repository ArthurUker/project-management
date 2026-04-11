#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🛑 Stopping RDPMS services..."
echo ""

# Stop backend
if [ -f "$SCRIPT_DIR/backend.pid" ]; then
  BACKEND_PID=$(cat "$SCRIPT_DIR/backend.pid")
  if kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null && echo "✅ Backend stopped (PID: $BACKEND_PID)"
  fi
  rm "$SCRIPT_DIR/backend.pid"
else
  echo "⚠️  backend.pid not found, trying pkill..."
  pkill -f "node src/index.js" 2>/dev/null || pkill -f "nodemon src/index.js" 2>/dev/null || true
fi

# Stop frontend
if [ -f "$SCRIPT_DIR/frontend.pid" ]; then
  FRONTEND_PID=$(cat "$SCRIPT_DIR/frontend.pid")
  if kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null && echo "✅ Frontend stopped (PID: $FRONTEND_PID)"
  fi
  rm "$SCRIPT_DIR/frontend.pid"
else
  echo "⚠️  frontend.pid not found, trying pkill..."
  pkill -f "vite" 2>/dev/null || true
fi

echo ""
echo "✅ All services stopped."
