#!/usr/bin/env bash
set -euo pipefail

# Creates a git repo with rich history for testing HydraGit.
# Usage: ./create-test-repo.sh /path/to/output-dir
# The script ONLY writes inside the given directory — never touches anything else.

REPO_DIR="${1:?Usage: $0 <output-directory>}"

if [ -d "$REPO_DIR/.git" ]; then
  echo "Repo already exists at $REPO_DIR, removing..."
  rm -rf "$REPO_DIR"
fi

mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

git init
git config user.email "test@hydragit.dev"
git config user.name "HydraGit Test"

# ─── Initial commits on main ───────────────────────────────────────────────────

echo "# Test Project" > README.md
git add README.md
git commit -m "Initial commit"

echo "module test-project" > go.mod
git add go.mod
git commit -m "Add go.mod"

mkdir -p src
echo 'package main

import "fmt"

func main() {
    fmt.Println("hello")
}' > src/main.go
git add src/main.go
git commit -m "Add main.go with hello world"

echo "v1.0.0 release" > CHANGELOG.md
git add CHANGELOG.md
git commit -m "Add changelog for v1.0.0"

git tag -a v1.0.0 -m "Release v1.0.0"

# ─── Feature branch with multiple commits ──────────────────────────────────────

git checkout -b feature/auth

echo 'package auth

func Login(user, pass string) bool {
    return user == "admin" && pass == "secret"
}' > src/auth.go
git add src/auth.go
git commit -m "feat: add basic auth module"

echo 'package auth

func Login(user, pass string) bool {
    return user == "admin" && pass == "secret"
}

func Logout() {
    // clear session
}' > src/auth.go
git add src/auth.go
git commit -m "feat: add logout function"

echo 'package auth

import "testing"

func TestLogin(t *testing.T) {
    if !Login("admin", "secret") {
        t.Fatal("expected login to succeed")
    }
}' > src/auth_test.go
git add src/auth_test.go
git commit -m "test: add auth tests"

# ─── Another feature branch (will create merge commit) ─────────────────────────

git checkout main 2>/dev/null || git checkout master
MAIN_BRANCH=$(git rev-parse --abbrev-ref HEAD)

git checkout -b feature/logging

mkdir -p src/logger
echo 'package logger

import "fmt"

func Info(msg string) {
    fmt.Printf("[INFO] %s\n", msg)
}

func Error(msg string) {
    fmt.Printf("[ERROR] %s\n", msg)
}' > src/logger/logger.go
git add src/logger/logger.go
git commit -m "feat: add logger package"

echo 'package main

import (
    "fmt"
    "test-project/src/logger"
)

func main() {
    logger.Info("starting up")
    fmt.Println("hello")
}' > src/main.go
git add src/main.go
git commit -m "refactor: use logger in main"

# ─── Merge logging into main ───────────────────────────────────────────────────

git checkout "$MAIN_BRANCH"
git merge feature/logging --no-ff -m "Merge feature/logging into $MAIN_BRANCH"

git tag -a v1.1.0 -m "Release v1.1.0 — logging"

# ─── Merge auth into main (creates another merge commit) ───────────────────────

git merge feature/auth --no-ff -m "Merge feature/auth into $MAIN_BRANCH"

git tag -a v1.2.0 -m "Release v1.2.0 — auth"

# ─── Hotfix branch ─────────────────────────────────────────────────────────────

git checkout -b hotfix/null-check

echo 'package auth

func Login(user, pass string) bool {
    if user == "" || pass == "" {
        return false
    }
    return user == "admin" && pass == "secret"
}

func Logout() {
    // clear session
}' > src/auth.go
git add src/auth.go
git commit -m "fix: handle empty credentials in Login"

git checkout "$MAIN_BRANCH"
git merge hotfix/null-check --no-ff -m "Merge hotfix/null-check"

# ─── Stashes ───────────────────────────────────────────────────────────────────

echo "work in progress..." >> src/main.go
git stash save "WIP: experimenting with main"

echo "temp debug code" > src/debug.go
git add src/debug.go
git stash save "WIP: debug utilities"

# ─── Diverged branch (for ahead/behind testing) ─────────────────────────────────

git checkout -b feature/diverged

echo "// diverged work" >> src/main.go
git add src/main.go
git commit -m "feat: diverged branch work"

echo "// more diverged work" >> src/main.go
git add src/main.go
git commit -m "feat: more diverged work"

# Add a commit to main so the branch is behind
git checkout "$MAIN_BRANCH"

echo "## Contributing" >> README.md
git add README.md
git commit -m "docs: add contributing section"

# ─── Branch with slashes (folder-like) ─────────────────────────────────────────

git checkout -b release/2.0.0

echo "v2.0.0-rc1" > VERSION
git add VERSION
git commit -m "chore: bump version to 2.0.0-rc1"

git checkout "$MAIN_BRANCH"

# ─── Orphan branch (like gh-pages) ─────────────────────────────────────────────

git checkout --orphan gh-pages
git rm -rf .
echo "<html><body>Docs</body></html>" > index.html
git add index.html
git commit -m "Initial gh-pages"

git checkout "$MAIN_BRANCH"

# ─── Remote simulation (bare repo as "origin") ─────────────────────────────────

REMOTE_DIR="${REPO_DIR}/../test-remote.git"
rm -rf "$REMOTE_DIR"
git clone --bare "$REPO_DIR" "$REMOTE_DIR"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_DIR"
git fetch origin
git branch -u origin/"$MAIN_BRANCH" "$MAIN_BRANCH"

# ─── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "✔ Test repo created at: $REPO_DIR"
echo "  Branches: $(git branch | wc -l | tr -d ' ')"
echo "  Tags: $(git tag | wc -l | tr -d ' ')"
echo "  Stashes: $(git stash list | wc -l | tr -d ' ')"
echo "  Commits: $(git rev-list --all --count)"
echo "  Remote: $REMOTE_DIR"
