#!/usr/bin/env bash
set -euo pipefail

# Creates a repo where N "developers" all fork from ONE common base commit and
# each merges back into main without squashing — i.e. N feature branches off the
# same point, N --no-ff merge commits. This is the wide-graph stress scenario.
#
# Usage: ./create-fork-merge-repo.sh /path/to/output-dir [branch-count]
# The script ONLY writes inside the given directory — never touches anything else.

REPO_DIR="${1:?Usage: $0 <output-directory> [branch-count]}"
N="${2:-3}"

if [ -d "$REPO_DIR/.git" ]; then
  echo "Repo already exists at $REPO_DIR, removing..."
  rm -rf "$REPO_DIR"
fi

mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

git init -q -b main
git config user.email "test@hydragit.dev"
git config user.name "HydraGit Test"

# ─── The one place everyone starts from ─────────────────────────────────────────
echo "base" > base.txt
git add base.txt
git commit -q -m "M0: common base"
BASE=$(git rev-parse HEAD)

# ─── N developers: each forks from BASE, does work, merges back (no squash) ─────
# Distinct file per branch → every merge is conflict-free.
for i in $(seq 0 $((N - 1))); do
  printf -v b "feature/dev-%03d" "$i"
  git checkout -q -b "$b" "$BASE"
  echo "dev $i — change A" > "f$i.txt"
  git add "f$i.txt"
  git commit -q -m "dev $i: work A"
  echo "dev $i — change B" >> "f$i.txt"
  git add "f$i.txt"
  git commit -q -m "dev $i: work B"
  git checkout -q main
  git merge -q --no-ff "$b" -m "Merge $b into main"
done

echo ""
echo "✔ Fork-merge repo created at: $REPO_DIR"
echo "  Developers (branches): $N"
echo "  Commits: $(git rev-list --all --count)"
