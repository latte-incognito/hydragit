#!/bin/bash
# Snapshot release: publish develop's current tree as ONE commit on master,
# tagged vX.Y.Z. No merge in either direction — master never diverges from
# develop, so back-merges are never needed. See docs/GITFLOW.md.
#
# Maintains CHANGELOG.md automatically: the "## [Unreleased]" section you keep
# during development is renamed to "## [X.Y.Z] — YYYY-MM-DD" and gets a compare
# link, committed on develop, and becomes the release commit's message body.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

V=$(node -p "require('./package.json').version")
TAG="v$V"
DATE=$(date +%F)
REPO_URL="https://github.com/latte-incognito/hydragit"

[ "$(git rev-parse --abbrev-ref HEAD)" = "develop" ] \
  || { echo "✗ releases are cut from develop — switch branches first"; exit 1; }

[ -z "$(git status --porcelain)" ] \
  || { echo "✗ working tree not clean — commit or stash first"; exit 1; }

# Version must be strictly higher than the latest released tag.
PREV=$(git tag -l 'v[0-9]*' | sort -V | tail -1)
if [ -n "$PREV" ]; then
  HIGHEST=$(printf '%s\n%s\n' "$PREV" "$TAG" | sort -V | tail -1)
  if [ "$HIGHEST" != "$TAG" ] || [ "$TAG" = "$PREV" ]; then
    echo "✗ package.json version $V is not higher than latest release $PREV — bump it first"
    exit 1
  fi
fi

git fetch origin master
[ "$(git rev-parse master)" = "$(git rev-parse origin/master)" ] \
  || { echo "✗ local master and origin/master differ — reconcile first"; exit 1; }

# The Unreleased section must exist and have content.
UNRELEASED=$(awk '/^## \[Unreleased\]/ {f=1; next} /^## \[/ {if (f) exit} f' CHANGELOG.md | grep -c . || true)
[ "$UNRELEASED" -gt 0 ] \
  || { echo "✗ CHANGELOG.md has no \"## [Unreleased]\" section with content — write it first"; exit 1; }

# Finalize the changelog: rename the header, insert the compare link.
TMP=$(mktemp)
awk -v ver="$V" -v date="$DATE" -v prev="$PREV" -v url="$REPO_URL" '
  /^## \[Unreleased\]/ && !renamed { print "## [" ver "] — " date; renamed=1; next }
  /^\[/ && !linked { print "[" ver "]: " url "/compare/" prev "..." "v" ver; linked=1 }
  { print }
' CHANGELOG.md > "$TMP" && mv "$TMP" CHANGELOG.md

git add CHANGELOG.md
git commit -m "chore: release $TAG — finalize changelog"

# Release commit message: subject + this version's changelog section as body.
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

COMMIT=$(git commit-tree 'develop^{tree}' -p master -F "$MSG")
git branch -f master "$COMMIT"
git tag "$TAG" "$COMMIT"
git push origin develop master "$TAG"

echo "✓ released $TAG"
echo "  master -> $(git rev-parse --short "$COMMIT")  (snapshot of develop@$(git rev-parse --short develop))"
echo "  package it with: git checkout $TAG && make package"
