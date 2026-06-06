#!/usr/bin/env bash
set -euo pipefail

# Creates a git repo left in a CONFLICTED merge state, for exercising
# HydraGit's merge-conflict handling (BUGS.MD #19).
# Usage: ./create-conflict-repo.sh /path/to/output-dir
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

# ─── Base commit ────────────────────────────────────────────────────────────────
printf 'line one\nline two\nline three\n' > conflict.txt
echo "shared" > shared.txt
git add .
git commit -qm "base"

BASE="$(git rev-parse --abbrev-ref HEAD)"

# ─── Diverge: feature branch edits the middle line ──────────────────────────────
git checkout -q -b feature
printf 'line one\nFEATURE edit\nline three\n' > conflict.txt
git commit -qam "feature: edit middle line"

# ─── Base branch edits the same middle line differently ─────────────────────────
git checkout -q "$BASE"
printf 'line one\nMAIN edit\nline three\n' > conflict.txt
git commit -qam "main: edit middle line"

# ─── Merge → conflict on conflict.txt. Leave the repo mid-merge. ────────────────
# `git merge` exits non-zero on conflict; that's expected, so don't let set -e
# abort the script.
git merge feature || true

echo "Conflict repo ready at $REPO_DIR"
git status --porcelain || true
