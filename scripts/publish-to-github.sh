#!/usr/bin/env bash
# One-shot GitHub publication for AEGIS 1.0.0.
# Prerequisite: `gh auth login` (or GH_TOKEN exported with repo + release scope).
# Usage: bash scripts/publish-to-github.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== preflight =="
git log --oneline -3
git tag --list 'v1.0.0'
gh auth status

echo "== create repo + push =="
gh repo create aegis --public --source=. --remote=origin --push
git push -u origin main --tags

echo "== release =="
gh release create v1.0.0 --title "AEGIS 1.0.0" --notes-file docs/release-1.0.0.md

echo "== verify =="
gh repo view --json url,name
gh release view v1.0.0 --json tagName,url
