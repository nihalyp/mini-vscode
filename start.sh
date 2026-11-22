#!/usr/bin/env bash
set -e

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$BASE_DIR/frontend"
BACKEND_DIR="$BASE_DIR/backend"

PIDS=()

cleanup() {
    echo ""
    echo "Stopping all servers..."
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    exit 0
}

trap cleanup INT TERM

echo "Starting Frontend HTTP Server on http://localhost:8000 ..."
(cd "$FRONTEND_DIR" && python3 -m http.server 8000) &
PIDS+=($!)

echo "Starting Code Runner Backend on http://localhost:5000 ..."
(cd "$BACKEND_DIR" && python3 server.py) &
PIDS+=($!)

echo "Starting Interactive Terminal WebSocket on ws://localhost:8765 ..."
(cd "$BACKEND_DIR" && python3 terminal_server.py) &
PIDS+=($!)

echo ""
echo "Mini VS Code is running!"
echo "Open in browser: http://localhost:8000/?v=7"
echo "Press Ctrl+C to stop all servers."

wait

