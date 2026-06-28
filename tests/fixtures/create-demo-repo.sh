#!/usr/bin/env bash
set -euo pipefail

# Curated, GOOD-LOOKING history for the demo recording (make demo).
# Unlike create-test-repo.sh (which packs octopus / criss-cross / orphan cases to
# stress the lane engine), this builds a clean, pretty graph: a main trunk with a
# couple of staggered feature merges (nice rounded lane bubbles), tags for ref
# pills, and ONE unmerged linear branch — feature/search — which the demo checks
# out and rebases. Unmerged + linear = a clean rebase with no dangling lane.
# Usage: ./create-demo-repo.sh /path/to/output-dir   (only writes inside it)

REPO_DIR="${1:?Usage: $0 <output-directory>}"

if [ -d "$REPO_DIR/.git" ]; then
  echo "Repo already exists at $REPO_DIR, removing..."
  rm -rf "$REPO_DIR"
fi

mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

git init -q
git config user.email "demo@hydragit.dev"
git config user.name "HydraGit Demo"

commit() { # commit <file> <content> <message>
  mkdir -p "$(dirname "$1")"
  printf '%s\n' "$2" > "$1"
  git add "$1"
  git commit -q -m "$3"
}

MAIN_BRANCH="$(git symbolic-ref --short HEAD)"

# ─── Trunk ─────────────────────────────────────────────────────────────────────
commit README.md     "# Acme App"                 "Initial commit"
commit go.mod        "module acme"                "Add go.mod"
commit src/app.go    "package main // app"        "feat: app scaffold"
git tag -a v0.1.0 -m "v0.1.0"

# ─── feature/login → merged (bubble 1) ─────────────────────────────────────────
git checkout -q -b feature/login
commit src/auth.go   "package auth // login"      "feat: login form"
commit src/auth.go   "package auth // login+jwt"  "feat: issue JWT on login"
git checkout -q "$MAIN_BRANCH"
commit src/log.go    "package main // logging"    "chore: structured logging"
git merge --no-ff -q feature/login -m "Merge feature/login"

# ─── feature/payments → merged (bubble 2, staggered) ───────────────────────────
git checkout -q -b feature/payments
commit src/pay.go    "package pay // stripe"      "feat: Stripe checkout"
commit src/pay.go    "package pay // refunds"     "feat: refund endpoint"
commit src/pay.go    "package pay // webhooks"    "feat: payment webhooks"
git checkout -q "$MAIN_BRANCH"
commit CHANGELOG.md  "## v0.2.0"                   "docs: start v0.2.0 changelog"
git merge --no-ff -q feature/payments -m "Merge feature/payments"
git tag -a v0.2.0 -m "v0.2.0"

# ─── feature/search → UNMERGED, linear (the rebase target) ─────────────────────
git checkout -q -b feature/search
commit src/search.go "package search // index"    "feat: search index"
commit src/search.go "package search // ranking"  "feat: result ranking"
git checkout -q "$MAIN_BRANCH"
# one more trunk commit so feature/search is genuinely diverged (ahead + behind)
commit src/app.go    "package main // app v2"      "refactor: tidy app entry"

# A stash so the sidebar STASH section isn't empty in the demo.
printf '%s\n' "wip" > src/wip.go
git add src/wip.go
git stash push -q -m "wip: experimental search UI" >/dev/null 2>&1 || true

# ─── Remote (bare repo as origin) so push/pull/sync pills have a target ─────────
REMOTE_DIR="${REPO_DIR}/../demo-remote.git"
rm -rf "$REMOTE_DIR"
git clone -q --bare "$REPO_DIR" "$REMOTE_DIR"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_DIR"
git fetch -q origin
git branch -u origin/"$MAIN_BRANCH" "$MAIN_BRANCH" >/dev/null 2>&1 || true

# End on the trunk (attached HEAD).
git checkout -q "$MAIN_BRANCH"

echo "✔ Demo repo created at: $REPO_DIR ($(git rev-list --all --count) commits, $(git branch | wc -l | tr -d ' ') branches)"
