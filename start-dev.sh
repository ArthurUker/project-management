#!/bin/bash

set -e

echo "🚀 Starting development environment..."

# Kill old processes
echo "🛑 Stopping old processes..."
lsof -iTCP:3000 -sTCP:LISTEN -P -n 2>/dev/null | tail -1 | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
lsof -iTCP:5173 -sTCP:LISTEN -P -n 2>/dev/null | tail -1 | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
sleep 1

# Apply Prisma schema
echo "📦 Pushing Prisma schema..."
cd rdpms-system/backend
npx prisma db push --accept-data-loss
echo "✅ Schema pushed"

# Run seed
echo "🌱 Seeding database..."
node prisma/seed.js
echo "✅ Seed completed"

# Start backend
echo "🔧 Starting backend..."
nohup npm run dev > backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"
sleep 3

# Start frontend
echo "🎨 Starting frontend..."
cd ../../rdpms-system/frontend
nohup npm run dev -- --port 5173 --host > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"
sleep 3

# Health check
echo "🏥 Health check..."
for i in {1..10}; do
  if curl -s http://localhost:3000/api/auth/verify >/dev/null 2>&1; then
    echo "✅ Backend ready"
    break
  fi
  echo "⏳ Waiting for backend ($i/10)..."
  sleep 1
done

echo "✅ All services started!"
echo "📱 Frontend: http://localhost:5173"
echo "🔧 Backend: http://localhost:3000"
