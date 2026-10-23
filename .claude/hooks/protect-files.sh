#!/usr/bin/env bash
# PreToolUse hook: stop Claude from editing files that should never be
# hand-edited. Exit 2 blocks the tool call and shows stderr to Claude.
#
#   - .env* files (real secrets; .env.local.example stays editable)
#   - package-lock.json (regenerate with npm install instead)
#   - migrations already committed to git (they may have been applied
#     to a live database; add a new numbered migration instead)

set -euo pipefail

input=$(cat)
file=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
[ -z "$file" ] && exit 0

project="${CLAUDE_PROJECT_DIR:-$(pwd)}"
rel="${file#"$project"/}"
name=$(basename "$file")

case "$name" in
  .env.local.example | .env.example) ;;
  .env*)
    echo "Blocked: $rel holds secrets and must not be edited by Claude. Edit .env.local.example instead, or ask the user to change it." >&2
    exit 2
    ;;
  package-lock.json)
    echo "Blocked: package-lock.json is generated. Change package.json and run npm install instead." >&2
    exit 2
    ;;
esac

if [[ "$rel" == supabase/migrations/*.sql ]] &&
  git -C "$project" cat-file -e "HEAD:$rel" 2>/dev/null; then
  echo "Blocked: $rel is a committed migration and may already be applied to live databases. Write a new numbered migration instead (see the create-migration skill)." >&2
  exit 2
fi

exit 0
