#!/bin/bash
set -e
cd "$(dirname "$0")"

# Kill anything already holding our ports (stale servers from old windows)
kill_port() {
  local port=$1
  if command -v taskkill >/dev/null 2>&1; then
    # Windows (Git Bash)
    for pid in $(netstat -ano 2>/dev/null | awk -v p="[.:]$port\$" '$2 ~ p && /LISTEN/ {print $NF}' | sort -u); do
      echo "Killing stale process $pid on port $port"
      taskkill //F //PID "$pid" >/dev/null 2>&1 || true
    done
  else
    fuser -k "$port/tcp" 2>/dev/null || true
  fi
}
kill_port 8000
kill_port 5173

echo "Starting backend..."
cd backend
source venv/Scripts/activate 2>/dev/null || source venv/bin/activate
uvicorn main:app --reload --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

echo "Starting frontend..."
cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

sleep 3
echo ""
echo "Backend running revision:"
curl -s http://localhost:8000/api/version || echo "(backend not up yet - check backend.log)"
echo ""
echo "Backend PID: $BACKEND_PID  (log: backend.log)"
echo "Frontend PID: $FRONTEND_PID  (log: frontend.log)"
echo ""
echo "Open http://localhost:5173 once the frontend log shows 'ready'."
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
