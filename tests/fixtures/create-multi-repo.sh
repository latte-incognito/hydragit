#!/usr/bin/env bash
set -euo pipefail

# Creates a PARENT folder containing two independent git repos (repo-a, repo-b),
# for multi-repo sidebar journeys. VS Code opens the parent; its git integration
# discovers both nested repos, which HydraGit groups in the sidebar.
# Usage: ./create-multi-repo.sh /path/to/parent-dir
# The script ONLY writes inside the given directory — never touches anything else.

PARENT="${1:?Usage: $0 <output-directory>}"

if [ -d "$PARENT" ]; then
  echo "Parent exists at $PARENT, removing..."
  rm -rf "$PARENT"
fi
mkdir -p "$PARENT"

make_repo() {
  local dir="$1" tag="$2"
  mkdir -p "$dir"
  cd "$dir"
  git init -q
  git config user.email "test@hydragit.dev"
  git config user.name "HydraGit Test"
  git config commit.gpgsign false
  echo "# $tag" > README.md
  printf 'export const id = "%s";\n' "$tag" > app.js
  git add .
  git commit -qm "${tag}: initial commit"
  git commit --allow-empty -qm "${tag}: second commit"
  # Leave a tracked modification so the sidebar has something to stage.
  printf 'export const id = "%s-dev";\n' "$tag" > app.js
}

make_repo "$PARENT/repo-a" "repoA"
make_repo "$PARENT/repo-b" "repoB"

echo "Multi-repo workspace ready at $PARENT (repo-a, repo-b)"
