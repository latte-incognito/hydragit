#!/usr/bin/env bash
set -euo pipefail

# Creates a git repo with a few commits AND an uncommitted working tree (one
# modified tracked file + one untracked file), for stage/commit/stash journeys.
# Usage: ./create-dirty-repo.sh /path/to/output-dir
# The script ONLY writes inside the given directory — never touches anything else.

REPO_DIR="${1:?Usage: $0 <output-directory>}"

if [ -d "$REPO_DIR/.git" ]; then
  echo "Repo already exists at $REPO_DIR, removing..."
  rm -rf "$REPO_DIR"
fi

mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

git init -q
git config user.email "test@hydragit.dev"
git config user.name "HydraGit Test"
git config commit.gpgsign false

echo "# Project" > README.md
printf 'export const version = "1.0.0";\n' > app.js
git add .
git commit -qm "initial commit"

printf 'export const version = "1.1.0";\n' >> app.js
git add app.js
git commit -qm "bump version"

# ── Leave the working tree dirty ────────────────────────────────────────────────
# modified tracked file:
printf 'export const version = "1.2.0-dev";\n' > app.js
# untracked file:
printf 'notes\n' > NOTES.md

echo "Dirty repo ready at $REPO_DIR"
git status --porcelain
