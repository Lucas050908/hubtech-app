#!/usr/bin/env bash
# Start HUBTECH (Linux / macOS). Kræver Python 3.8+.
cd "$(dirname "$0")"
PY=$(command -v python3 || command -v python)
if [ -z "$PY" ]; then echo "Python 3 blev ikke fundet. Installer det fra https://www.python.org"; exit 1; fi
"$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' || { echo "HUBTECH kræver Python 3.8 eller nyere."; exit 1; }
PORT=$(grep -E '^HUBTECH_PORT=' .env 2>/dev/null | cut -d= -f2); PORT=${PORT:-8090}
URL="http://127.0.0.1:$PORT"
if [ "$(uname)" = "Darwin" ]; then (sleep 1.2; open "$URL") >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null; then (sleep 1.2; xdg-open "$URL") >/dev/null 2>&1 &
fi
exec "$PY" server/app.py "$@"
