#!/bin/bash
set -e
cd "$(dirname "$0")"

# Ports are overridable so this app can run alongside other dev servers:
#   BACKEND_PORT=8001 FRONTEND_PORT=5174 ./start.sh
BACKEND_PORT=${BACKEND_PORT:-8000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}

# Free ONLY our own ports. Never kill by image name (python.exe/node.exe) -
# that also kills unrelated dev servers belonging to other projects.
port_pids() {
  local port=$1
  if command -v netstat >/dev/null 2>&1; then
    netstat -ano 2>/dev/null |
      awk -v p="[.:]$port\$" '$2 ~ p && /LISTEN/ {print $NF}' | sort -u
  fi
}

kill_port() {
  local port=$1 pid
  for pid in $(port_pids "$port"); do
    echo "Freeing port $port (pid $pid)"
    if command -v taskkill >/dev/null 2>&1; then
      taskkill //F //PID "$pid" >/dev/null 2>&1 || true
    else
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

require_free() {
  local port=$1
  kill_port "$port"
  sleep 1
  if [ -n "$(port_pids "$port")" ]; then
    echo "ERROR: port $port is still in use and could not be freed."
    echo "       Something outside this shell owns it (elevated or WSL process)."
    echo "       Re-run on another port, e.g.:"
    echo "         BACKEND_PORT=8001 FRONTEND_PORT=5174 ./start.sh"
    exit 1
  fi
}

require_free "$BACKEND_PORT"
require_free "$FRONTEND_PORT"

# Windows consoles default to legacy codepages that crash on non-ASCII
# video titles; force Python to use UTF-8 everywhere
export PYTHONUTF8=1

echo "Starting backend on $BACKEND_PORT..."
cd backend
source venv/Scripts/activate 2>/dev/null || source venv/bin/activate
uvicorn main:app --reload --port "$BACKEND_PORT" > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

echo "Starting frontend on $FRONTEND_PORT..."
cd frontend
# Tell the UI where the API lives, so a non-default backend port still works
VITE_API_BASE="http://localhost:$BACKEND_PORT" \
  npm run dev -- --port "$FRONTEND_PORT" > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

sleep 3
echo ""
echo "Backend running revision:"
curl -s "http://localhost:$BACKEND_PORT/api/version" ||
  echo "(backend not up yet - check backend.log)"
echo ""
echo "Backend PID: $BACKEND_PID  (log: backend.log)"
echo "Frontend PID: $FRONTEND_PID  (log: frontend.log)"
echo ""
echo "Open http://localhost:$FRONTEND_PORT once the frontend log shows 'ready'."
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
