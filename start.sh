#!/bin/bash
set -e
cd "$(dirname "$0")"

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

echo ""
echo "Backend PID: $BACKEND_PID  (log: backend.log)"
echo "Frontend PID: $FRONTEND_PID  (log: frontend.log)"
echo ""
echo "Open http://localhost:5173 once the frontend log shows 'ready'."
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
