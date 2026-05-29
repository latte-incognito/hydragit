#!/usr/bin/env bash
set -euo pipefail

# Creates a git repo with a large, linear-ish history for scroll/perf testing.
# Usage: ./create-perf-repo.sh /path/to/output-dir [commit-count]
# The script ONLY writes inside the given directory — never touches anything else.

REPO_DIR="${1:?Usage: $0 <output-directory> [commit-count]}"
COUNT="${2:-1200}"

if [ -d "$REPO_DIR/.git" ]; then
  echo "Repo already exists at $REPO_DIR, removing..."
  rm -rf "$REPO_DIR"
fi

mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

git init -q
git config user.email "test@hydragit.dev"
git config user.name "HydraGit Test"

echo "# Perf Project" > README.md
git add README.md
git commit -q -m "Initial commit"

# Bulk of the history: $COUNT empty commits on main. Empty commits keep this
# fast while still exercising the log/graph render path at scale.
for i in $(seq 1 "$COUNT"); do
  git commit -q --allow-empty -m "commit $i"
done

# A few interleaved branches + merges so the graph isn't purely a single lane.
for b in 1 2 3; do
  git checkout -q -b "perf/branch-$b"
  git commit -q --allow-empty -m "perf branch $b work"
  git checkout -q main
  git merge -q --no-ff "perf/branch-$b" -m "Merge perf/branch-$b"
done

echo ""
echo "✔ Perf repo created at: $REPO_DIR"
echo "  Commits: $(git rev-list --all --count)"
