#!/usr/bin/env bash
# Single entry point for Playwright E2E (npm run test:e2e / test:e2e:quick).
# - One run at a time per machine (lock), so agents never share server/QA account.
# - Port 9004 belongs to E2E only: anything still listening there when we hold
#   the lock is an orphan from a killed run, and is stopped before and after.
# - Automatically reuses `.next-e2e` when no app/config files changed since last build.
# - Credentials come from the macOS keychain when not already in the env.
set -uo pipefail

cd "$(dirname "$0")/.."
PORT=9004
LOCK=.e2e.lock
STAMP=.next-e2e/.e2e-build-stamp
BUILD_PID=""
PW_PID=""

free_port() {
  local pids
  pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "e2e: stopping server on :$PORT (pid $pids)" >&2
    kill $pids 2>/dev/null || true
    sleep 1
    pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  fi
  pkill -f "NEXT_DIST_DIR=\\.next-e2e" 2>/dev/null || true
}

cleanup() {
  trap - EXIT INT TERM HUP
  if [ -n "$BUILD_PID" ] && kill -0 "$BUILD_PID" 2>/dev/null; then
    pkill -TERM -P "$BUILD_PID" 2>/dev/null || true
    kill -TERM "$BUILD_PID" 2>/dev/null || true
  fi
  if [ -n "$PW_PID" ] && kill -0 "$PW_PID" 2>/dev/null; then
    pkill -TERM -P "$PW_PID" 2>/dev/null || true
    kill -TERM "$PW_PID" 2>/dev/null || true
  fi
  free_port
  rm -rf "$LOCK"
}

if ! mkdir "$LOCK" 2>/dev/null; then
  owner=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$owner" ] && kill -0 "$owner" 2>/dev/null; then
    echo "e2e: another E2E run is active (pid $owner). Wait for it; do not start a second one." >&2
    exit 2
  fi
  echo "e2e: removing stale lock (pid ${owner:-?} is gone)" >&2
  rm -rf "$LOCK"
  mkdir "$LOCK"
fi
echo $$ >"$LOCK/pid"
trap 'cleanup' EXIT
trap 'cleanup; exit 130' INT TERM HUP

free_port

if [ -z "${E2E_EMAIL:-}" ] || [ -z "${E2E_PASSWORD:-}" ]; then
  E2E_EMAIL="$(security find-generic-password -s bm-e2e-email -w 2>/dev/null || true)"
  E2E_PASSWORD="$(security find-generic-password -s bm-e2e-password -w 2>/dev/null || true)"
  export E2E_EMAIL E2E_PASSWORD
fi

# Skip build for metadata-only flags (--list, --help, --version).
case " $* " in
  *" --list "*|*" --help "*|*" --version "*)
    export E2E_SKIP_BUILD=1
    ;;
esac

if [ "${E2E_FORCE_BUILD:-0}" != "1" ] && [ "${E2E_SKIP_BUILD:-0}" != "1" ] && [ -f "$STAMP" ] && [ -f .next-e2e/BUILD_ID ]; then
  stale=$(find src public next.config.ts package.json package-lock.json tsconfig.json .env.local -newer "$STAMP" 2>/dev/null | head -n 1 || true)
  if [ -z "$stale" ]; then
    echo "e2e: reusing up-to-date .next-e2e build" >&2
    export E2E_SKIP_BUILD=1
  fi
fi

if [ "${E2E_SKIP_BUILD:-0}" != "1" ]; then
  echo "e2e: building .next-e2e..." >&2
  NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_E2E=1 NEXT_PUBLIC_E2E_POLL_INTERVAL_MS=750 npx next build &
  BUILD_PID=$!
  wait "$BUILD_PID"
  build_status=$?
  BUILD_PID=""
  if [ "$build_status" -ne 0 ]; then
    exit "$build_status"
  fi
  touch "$STAMP"
  export E2E_SKIP_BUILD=1
fi

npx playwright test "$@" &
PW_PID=$!
wait "$PW_PID"
exit $?
