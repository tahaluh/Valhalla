#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_DIR/.valhalla-server.pid"
LOG_FILE="$PROJECT_DIR/data/server.log"

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(<"$PID_FILE")" 2>/dev/null
}

case "${1:-status}" in
  start)
    if is_running; then
      echo "Valhalla já está rodando (PID $(<"$PID_FILE"))."
      exit 0
    fi
    mkdir -p "$PROJECT_DIR/data"
    cd "$PROJECT_DIR"
    nohup npm start >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
    echo "Valhalla iniciado (PID $(<"$PID_FILE")). Log: $LOG_FILE"
    ;;
  stop)
    if ! is_running; then
      echo "Valhalla não está rodando."
      exit 0
    fi
    SERVER_PID="$(<"$PID_FILE")"
    kill "$SERVER_PID"
    rm -f "$PID_FILE"
    echo "Valhalla parado."
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    if is_running; then
      echo "Valhalla rodando (PID $(<"$PID_FILE"))."
    else
      echo "Valhalla parado."
      exit 1
    fi
    ;;
  logs)
    touch "$LOG_FILE"
    tail -n 100 -f "$LOG_FILE"
    ;;
  *)
    echo "Uso: $0 {start|stop|restart|status|logs}" >&2
    exit 2
    ;;
esac
