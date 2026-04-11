#!/bin/bash
set -e
echo "=== 停止 R&D PMS 服务 ==="

# Stop backend by matching command line
echo "停止后端 (匹配 node src/index.js)..."
PIDS_BACKEND=$(ps aux | grep "node .*src/index.js" | grep -v grep | awk '{print $2}') || true
if [ -n "${PIDS_BACKEND}" ]; then
  echo "Stopping backend PIDs: ${PIDS_BACKEND}"
  kill ${PIDS_BACKEND} 2>/dev/null || true
fi

# Force free port 3000
PIDS_3000=$(lsof -ti:3000 2>/dev/null || true)
if [ -n "${PIDS_3000}" ]; then
  echo "强制释放端口 3000（PID: ${PIDS_3000}）"
  kill -9 ${PIDS_3000} 2>/dev/null || true
fi

# Stop frontend (vite / npm run dev)
echo "停止前端 (匹配 vite/npm run dev)..."
PIDS_FRONTEND=$(ps aux | grep "vite" | grep -v grep | awk '{print $2}') || true
PIDS_NPMDEV=$(ps aux | grep "npm run dev" | grep -v grep | awk '{print $2}') || true
ALL_FRONTEND_PIDS="${PIDS_FRONTEND} ${PIDS_NPMDEV}"
if [ -n "${ALL_FRONTEND_PIDS// /}" ]; then
  echo "Stopping frontend PIDs: ${ALL_FRONTEND_PIDS}"
  kill ${ALL_FRONTEND_PIDS} 2>/dev/null || true
fi

# Force free port 5173
PIDS_5173=$(lsof -ti:5173 2>/dev/null || true)
if [ -n "${PIDS_5173}" ]; then
  echo "强制释放端口 5173（PID: ${PIDS_5173}）"
  kill -9 ${PIDS_5173} 2>/dev/null || true
fi

# Wait a moment
sleep 2

# Verify ports
PORT_3000=$(lsof -ti:3000 2>/dev/null || true)
PORT_5173=$(lsof -ti:5173 2>/dev/null || true)

if [ -z "${PORT_3000}" ] && [ -z "${PORT_5173}" ]; then
  echo "✅ 所有服务已停止，端口已释放"
else
  [ -n "${PORT_3000}" ] && echo "⚠️  端口 3000 仍被占用：${PORT_3000}"
  [ -n "${PORT_5173}" ] && echo "⚠️  端口 5173 仍被占用：${PORT_5173}"
fi
