#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

cleanup() {
  echo ""
  echo "Shutting down…"
  kill $BE_PID $FE_PID 2>/dev/null || true
  wait $BE_PID $FE_PID 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# ── Backend env ────────────────────────────────────────────────
if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  echo "Created backend/.env from .env.example"
  echo "  → Edit backend/.env to set your MONGODB_URI (or leave defaults for local MongoDB)"
fi

# ── Python venv + deps ────────────────────────────────────────
if [ ! -d "$BACKEND/.venv" ]; then
  echo "Creating Python virtual environment…"
  python3 -m venv "$BACKEND/.venv"
fi
source "$BACKEND/.venv/bin/activate"

echo "Installing backend dependencies…"
pip install -q -r "$BACKEND/requirements.txt"

# ── Frontend deps ─────────────────────────────────────────────
if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "Installing frontend dependencies…"
  (cd "$FRONTEND" && npm install --silent)
fi

# ── Start both servers ────────────────────────────────────────
echo ""
echo "Starting MDBA…"
echo "  Backend  → http://127.0.0.1:8000"
echo "  Frontend → http://127.0.0.1:5173"
echo "  Press Ctrl+C to stop"
echo ""

(cd "$BACKEND" && uvicorn app.main:app --reload --host 127.0.0.1 --port 8001) &
BE_PID=$!

(cd "$FRONTEND" && npm run dev -- --host 127.0.0.1) &
FE_PID=$!

wait $BE_PID $FE_PID
