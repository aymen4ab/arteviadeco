#!/usr/bin/env bash
# PostToolUse hook: run ESLint on the TS/JS file Claude just edited and
# feed any errors back so they get fixed before CI sees them.
#
# Lint only, no auto-format: the codebase mixes quote styles and CI does
# not run prettier, so formatting on every edit would churn whole files.

set -uo pipefail

input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

project="${CLAUDE_PROJECT_DIR:-$(pwd)}"
eslint="$project/node_modules/.bin/eslint"
# Dependencies not installed yet (fresh clone): skip quietly.
[ -x "$eslint" ] || exit 0

cd "$project" || exit 0
if ! output=$("$eslint" --no-warn-ignored "$file" 2>&1); then
  echo "ESLint found problems in ${file#"$project"/}:" >&2
  echo "$output" >&2
  exit 2
fi

exit 0
