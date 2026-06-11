#!/bin/bash
# Snapshot release: publish develop's current tree as ONE commit on master,
# tagged vX.Y.Z. No merge in either direction — master never diverges from
# develop, so back-merges are never needed. See docs/GITFLOW.md.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

V=$(node -p "require('./package.json').version")
TAG="v$V"

[ "$(git rev-parse --abbrev-ref HEAD)" = "develop" ] \
  || { echo "✗ releases are cut from develop — switch branches first"; exit 1; }

[ -z "$(git status --porcelain)" ] \
  || { echo "✗ working tree not clean — commit or stash first"; exit 1; }

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "✗ tag $TAG already exists — bump the version in package.json first"
  exit 1
fi

git fetch origin master
[ "$(git rev-parse master)" = "$(git rev-parse origin/master)" ] \
  || { echo "✗ local master and origin/master differ — reconcile first"; exit 1; }

# Commit message: subject + this version's CHANGELOG.md section as the body.
MSG=$(mktemp)
trap 'rm -f "$MSG"' EXIT
{
  echo "release: $TAG"
  echo
  awk -v ver="$V" '
    $0 ~ "^## \\[" ver "\\]" { found = 1; next }
    /^## \[/                 { if (found) exit }
    found' CHANGELOG.md
} > "$MSG"

[ "$(grep -c . "$MSG")" -gt 1 ] \
  || { echo "✗ no \"## [$V]\" section in CHANGELOG.md — write it first"; exit 1; }

COMMIT=$(git commit-tree 'develop^{tree}' -p master -F "$MSG")
git branch -f master "$COMMIT"
git tag "$TAG" "$COMMIT"
git push origin develop master "$TAG"

echo "✓ released $TAG"
echo "  master -> $(git rev-parse --short "$COMMIT")  (snapshot of develop@$(git rev-parse --short develop))"
echo "  package it with: git checkout $TAG && make package"
