#!/usr/bin/env bash
# SessionStart hook: make a fresh cloud session ready to typecheck, test and
# build without a manual `npm install`. Local sessions are left alone.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# npm keeps a hidden lockfile in node_modules; if the real lockfile is newer,
# dependencies changed since the last install. postinstall runs prisma generate.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm install --no-audit --no-fund >/dev/null
elif [ ! -d node_modules/.prisma/client ]; then
  npx prisma generate >/dev/null
fi
