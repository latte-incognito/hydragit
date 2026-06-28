# HydraGit — Release & Distribution Guide

A complete, copy-pasteable walkthrough for cutting a release and shipping it —
written so you can do the whole thing **without help and without losing context**.
Start at the TL;DR, then follow the section that matches how you want to distribute.

> **First, clear up one thing:** VS Code extensions have **nothing to do with
> Apple**. There is no Apple Developer account, no $99/year fee, no notarization.
> The two real "stores" are:
> - **VS Code Marketplace** — run by Microsoft. Needs a **free** Microsoft
>   account. This is what `vsce publish` targets.
> - **Open VSX** — the open-source registry used by VSCodium, Cursor, Gitpod,
>   Theia, etc. Needs a **free** Eclipse account.
>
> And you don't strictly need *either*: you can ship the `.vsix` file straight
> from **GitHub Releases**, and users install it with one click. No account at
> all. That's **Path A** below and it's the recommended starting point.

---

## TL;DR — the whole flow in one screen

```bash
# 0. one-time tooling (install once, ever)
npm install -g @vscode/vsce ovsx

# 1. on develop: make sure it's green and the changelog is ready
git checkout develop
make test            # Go + Vitest
make lint            # 0 errors required (warnings are fine)

# 2. bump the version in package.json (e.g. 0.3.0 -> 0.3.1), commit
#    then cut the snapshot release (tags + pushes master & develop)
make release

# 3. build the distributable .vsix from the exact tag
git checkout v0.3.1
make build           # build all 5 platform binaries + extension + webview
codesign --force --sign - bin/hydragit-server-darwin-arm64   # REQUIRED for Apple Silicon (§5)
codesign --force --sign - bin/hydragit-server-darwin-x64
vsce package         # -> hydragit-0.3.1.vsix  (bundles ALL platforms)
git checkout develop

# 4a. distribute via GitHub (no account needed)
gh release create v0.3.1 hydragit-0.3.1.vsix --title "v0.3.1" --notes-from-tag

# 4b. OR publish to the VS Code Marketplace (needs free Microsoft account, §7)
vsce publish

# 4c. OR publish to Open VSX for VSCodium/Cursor users (needs free account, §7)
ovsx publish hydragit-0.3.1.vsix -p <OPENVSX_TOKEN>
```

Everything below is the same steps, explained, with troubleshooting.

---

## 0 · Prerequisites (install once)

| Tool | Why | Install |
|---|---|---|
| Node.js ≥ 18 | builds the webview + extension | already have it |
| Go ≥ 1.21 | builds the 5 platform binaries | already have it |
| `@vscode/vsce` | packages & publishes the `.vsix` | `npm install -g @vscode/vsce` |
| `ovsx` | publishes to Open VSX (optional) | `npm install -g ovsx` |
| `gh` (GitHub CLI) | creates GitHub Releases from the terminal | `brew install gh`, then `gh auth login` |

Verify:
```bash
vsce --version
ovsx --version     # only if using Open VSX
gh --version
```

---

## 1 · Understand what you're shipping (read once)

**The `.vsix` is self-contained and cross-platform.** `make package` runs
`make build-all`, which compiles the Go server for **all five** targets:

```
bin/hydragit-server-darwin-x64
bin/hydragit-server-darwin-arm64
bin/hydragit-server-linux-x64
bin/hydragit-server-linux-arm64
bin/hydragit-server-win32-x64.exe
```

All five are bundled into one `.vsix` (~20 MB). At runtime the extension picks
the right one for the user's OS/arch (`extension/src/extension.ts` →
`hydragit-server-${platform}-${arch}`). **Consequence:** a single file you upload
to GitHub installs and runs on macOS (Intel + Apple Silicon), Linux, and Windows.
You never build per-user.

**The release model is "snapshot to master."** You only ever work on `develop`.
`make release` publishes develop's tree as **one commit on `master`**, tags it
`vX.Y.Z`, and pushes. `master` is generated — **never commit to it directly.**
(Full rationale: `docs/GITFLOW.md`.)

**Where the version lives:** the single source of truth is `"version"` in the
**root `package.json`**. The Makefile, the release script, and `vsce` all read it.

---

## 2 · Pre-release checklist (on `develop`)

Run these in order. Do not proceed past a red step.

```bash
git checkout develop
git pull                      # make sure you're current

make test                     # Go (gotestsum) + Vitest — must be all green
make lint                     # must be 0 ERRORS (warnings are OK and expected)
go test -race ./internal/ipc/ # the concurrency suite — -race is the point
make build                    # confirms the production build compiles end-to-end
```

Then check the human-facing bits:

- [ ] **`CHANGELOG.md` has a `## [Unreleased]` section with real content.**
      `make release` turns this into the version's notes automatically and
      **refuses to run if it's empty.** Write user-facing bullets, not commit noise.
- [ ] **`README.md` reads well** — it's literally the Marketplace landing page.
      Any images must use **absolute `https://` URLs** (relative paths don't
      render on the Marketplace, and the banner only works once the repo is public).
- [ ] **Use it on a real repo for a few days** before a *first* Marketplace push.
      Marketplace releases are public and permanent per version.

---

## 3 · Bump the version

Pick the new number with semver (see §9 for when to use which):

```bash
# edit package.json: "version": "0.3.0"  ->  e.g. "0.3.1"
git add package.json
git commit -m "chore: bump version to 0.3.1"
```

> The current `package.json` says `0.3.0` and the latest tag is `v0.2.9`, so the
> **next** `make release` will cut **`v0.3.0`** with no bump needed. After that,
> bump for each subsequent release.

`make release` enforces that the new version is **strictly higher** than the
latest `v*` tag, so you can't accidentally re-release.

---

## 4 · Cut the release

```bash
make release
```

This script (`scripts/release.sh`) refuses to run unless **all** of these hold:
you're on `develop`, the working tree is clean, the version is higher than the
latest tag, local `master` == `origin/master`, and `[Unreleased]` has content.
Then it automatically:

1. Renames `## [Unreleased]` → `## [X.Y.Z] — <today>` in `CHANGELOG.md`, adds the
   GitHub compare link, and commits that on `develop`.
2. Creates **one commit on `master`** whose tree is develop's tree verbatim, with
   the changelog section as the message (no merge → no conflict possible).
3. Tags it `vX.Y.Z`.
4. Pushes `develop`, `master`, and the tag to `origin`.

Output ends with `✓ released vX.Y.Z`. Your git history is now done; the rest is
packaging and distribution.

---

## 5 · Code signing the native binaries (macOS — read this)

**Why this matters:** the `.vsix` bundles native Go binaries. On **Apple Silicon
(arm64), macOS refuses to run an *unsigned* binary at all** — the process is
SIGKILL'd with "code signature invalid". Your `make build-all` **cross-compiles**
the `darwin-arm64` target, and Go's linker only auto-signs binaries built for the
**host** arch — so a cross-compiled arm64 binary is unsigned and will be killed on
M1/M2/M3 Macs. This is the one signing step you cannot skip.

**The fix needs NO Apple account: ad-hoc signing.** `codesign --sign -` is free,
offline, requires no certificate and no Developer Program — it just makes the
binary *executable* on Apple Silicon. That's all a spawned helper binary needs.

Order matters — **build → sign → package** (and don't use `make package` here,
because it rebuilds and would wipe the signatures):

```bash
git checkout v0.3.1

make build              # builds all 5 binaries + extension + webview

# ad-hoc sign BOTH macOS binaries (free, no account, no cert)
codesign --force --sign - bin/hydragit-server-darwin-arm64
codesign --force --sign - bin/hydragit-server-darwin-x64

# verify the signature took
codesign -dv bin/hydragit-server-darwin-arm64 2>&1 | grep -i signature   # "Signature=adhoc"

vsce package            # packages the now-signed binaries -> hydragit-0.3.1.vsix
git checkout develop
```

> **Tip:** to make this repeatable, add a `sign-macos` target to the Makefile and
> a `package-signed: build sign-macos` target that runs `vsce package` (not the
> default `package:` which rebuilds). Then a release is just `make package-signed`.

**What you are *not* doing (and why it's OK):**
- **Notarization / Developer ID signing** — this is the part that needs the **paid
  Apple Developer account ($99/yr)** you're skipping. It only removes the Gatekeeper
  *quarantine* prompt for files a user downloads via a browser. A binary your
  extension *spawns* (not double-clicks in Finder) does not require it to run.
- **Consequence to document for users:** if someone downloads the `.vsix` from
  GitHub via a browser, macOS may tag the extracted files with a quarantine flag
  and show a one-time warning. Mitigations (put in your README):
  - Install via `code --install-extension hydragit-X.Y.Z.vsix` or via the
    Marketplace/Open VSX — these paths generally don't apply the browser quarantine.
  - Or clear it manually once: `xattr -dr com.apple.quarantine <extension folder>`.

**Windows:** the unsigned `.exe` **runs fine**; users may see a one-time SmartScreen
notice. Removing it needs an Authenticode/EV code-signing certificate (paid, from a
CA) — optional, not required to function. **Linux:** no code signing exists; nothing
to do.

---

## 6 · Build the `.vsix` from the tag

> If you did §5 (macOS signing), you've **already produced the `.vsix`** — skip to
> the sanity-check below. This section is the short version for when you're shipping
> a non-macOS-only build or don't care about Apple Silicon.

**Always package from the tag**, not from a dirty develop — `vsce` packages
whatever is checked out, so you want the exact released tree:

```bash
git checkout v0.3.1
make package           # -> hydragit-0.3.1.vsix in the repo root
git checkout develop   # go back to where you work
```

**Sanity-check the package contents before shipping** (catches accidental leaks
of source/binaries):

```bash
vsce ls               # prints every file that will go into the .vsix
```

You want to see:
- ✅ all **5** `bin/hydragit-server-*` binaries
- ✅ `extension/out/**` (compiled JS) and `webview/*.js` / `*.css` (compiled)
- ✅ `images/icon.png`, `README.md`, `CHANGELOG.md`, `LICENSE.md`, `package.json`
- ❌ **no** `cmd/`, `internal/`, `*.ts` source, `docs/`, `tests/`, `node_modules/`,
  `.github/`, the dev binary `bin/hydragit-server` (no suffix)

(The exclusions live in `.vscodeignore`; if something leaks, add it there.)

---

## 7 · Distribute — pick your path(s)

You can do **any combination** of these. Path A is the floor; A+B+C is the
"available everywhere" setup.

### Path A — GitHub Releases (no account, recommended baseline)

This is how people install **without** any Marketplace. You attach the `.vsix`
to a GitHub Release and users install it with one click.

**With the GitHub CLI (fastest):**
```bash
gh release create v0.3.1 hydragit-0.3.1.vsix \
  --title "HydraGit v0.3.1" \
  --notes-from-tag        # uses the tag/commit message (your changelog section)
```
If `--notes-from-tag` looks thin, write notes inline instead:
```bash
gh release create v0.3.1 hydragit-0.3.1.vsix --title "HydraGit v0.3.1" \
  --notes "$(awk '/^## \[0.3.1\]/{f=1;next} /^## \[/{if(f)exit} f' CHANGELOG.md)"
```

**Or via the web UI:** GitHub → **Releases** → **Draft a new release** → choose
tag `v0.3.1` → paste the changelog into the body → drag in `hydragit-0.3.1.vsix`
→ **Publish release**.

**Tell users to install it** (put this in your README):
> Download `hydragit-X.Y.Z.vsix` from
> [Releases](https://github.com/latte-incognito/hydragit/releases), then in VS Code:
> **Extensions** panel → `…` menu → **Install from VSIX…** → pick the file.
> Or from a terminal: `code --install-extension hydragit-X.Y.Z.vsix`.

Caveat to set expectations: VSIX-installed extensions **don't auto-update**.
Users re-download to upgrade. (That's the main reason to also do Path B.)

---

### Path B — VS Code Marketplace ("the plugin store")

This is the searchable store inside VS Code's Extensions panel, with auto-updates.

#### One-time setup (~10 min, do this once ever)

1. **Create a Microsoft account** if you don't have one (free).
2. Go to **https://dev.azure.com** with that account (create an organization if
   prompted — name doesn't matter).
3. Top-right avatar → **User settings** → **Personal access tokens** →
   **New Token**:
   - **Name:** `hydragit-publish`
   - **Organization:** **All accessible organizations** ← important
   - **Expiration:** 1 year (you'll renew)
   - **Scopes:** click **Show all scopes**, find **Marketplace**, check
     **Manage**.
   - **Create** → **copy the token now** (you can't see it again). Save it in a
     password manager.
4. **Create the publisher** (one time; the ID is permanent):
   ```bash
   vsce create-publisher vkushnarenko
   ```
   Or create it in the web UI at
   **https://marketplace.visualstudio.com/manage** → **Create publisher**.
   The publisher ID **must equal** `"publisher"` in `package.json` →
   already `vkushnarenko`, so the extension will be `vkushnarenko.hydragit`.
5. **Log in** with the PAT:
   ```bash
   vsce login vkushnarenko    # paste the PAT when prompted
   ```

#### Publishing (every release)

From the tag (or with the `.vsix` you already built):

```bash
# either: build + publish in one go (reads version from package.json)
git checkout v0.3.1
make publish               # = make build + vsce publish
git checkout develop

# or: publish the exact file you already packaged & inspected
vsce publish --packagePath hydragit-0.3.1.vsix
```

It goes live in ~5 minutes at
`https://marketplace.visualstudio.com/items?itemName=vkushnarenko.hydragit`.

> **Prereqs the Marketplace enforces:** a `repository` field (✅ present), a
> `LICENSE` (✅ `LICENSE.md`, GPL-3.0), an `icon` (✅ `images/icon.png`), and a
> `README.md`. The repo should be **public** so README images and the repo link
> resolve.

> **Renewing the PAT (yearly):** repeat step 3, then `vsce login vkushnarenko`
> with the new token. Nothing else changes.

---

### Path C — Open VSX (for VSCodium / Cursor / Gitpod users)

These editors **cannot** use the Microsoft Marketplace; they pull from Open VSX.
If you want those users, publish here too. Free.

#### One-time setup

1. Create a free account at **https://open-vsx.org** (sign in with GitHub).
2. Sign the publisher agreement: profile → settings → there's a one-time
   Eclipse Foundation Publisher Agreement to accept.
3. Create an **Access Token** (profile → **Access Tokens** → generate) and save it.
4. Create your namespace (must match the publisher `vkushnarenko`):
   ```bash
   ovsx create-namespace vkushnarenko -p <OPENVSX_TOKEN>
   ```

#### Publishing (every release)

```bash
ovsx publish hydragit-0.3.1.vsix -p <OPENVSX_TOKEN>
```

Live at `https://open-vsx.org/extension/vkushnarenko/hydragit`.

---

## 8 · Post-release verification (5 minutes)

- [ ] **GitHub:** the Release shows the `.vsix` asset and the changelog notes.
- [ ] **Fresh install test:** on a clean VS Code (or a different machine), install
      the `.vsix` and open a real repo — confirm the panel loads and basic ops work.
      This is your safety net against a bad binary or a missing-file packaging bug.
- [ ] **Marketplace (if Path B):** the item page renders the README, icon, version,
      and Changelog tab. Search "HydraGit" inside VS Code's Extensions panel.
- [ ] **Open VSX (if Path C):** the extension page resolves.
- [ ] **`git log master`** reads like your changelog (one commit per version). ✅

---

## 9 · Versioning policy (semver)

`MAJOR.MINOR.PATCH` — for a pre-1.0 tool, in practice:

| Bump | When | Example |
|---|---|---|
| **PATCH** (`0.3.0 → 0.3.1`) | bug fixes, polish, docs, internal refactors with no user-facing behavior change | most releases |
| **MINOR** (`0.3.0 → 0.4.0`) | new user-facing feature, additive | "added worktree manager" |
| **MAJOR** (`0.x → 1.0.0`) | the "it's ready, I stand behind it" milestone; later, breaking changes | first stable |

Rule from `docs/GITFLOW.md`: **never re-point a published tag.** If a release is
broken, ship a new patch — don't rewrite history.

---

## 10 · Hotfix flow

There's no separate hotfix branch — fix forward on `develop`:

```bash
git checkout develop
# ...fix the bug, add a CHANGELOG [Unreleased] bullet, commit...
# bump patch version in package.json, commit
make release           # cuts the new patch tag
git checkout vX.Y.Z && make package && git checkout develop
# re-distribute via whichever paths you used (§7)
```

If a **published Marketplace version** is broken, publish the patch ASAP — users
auto-update. For GitHub-only, edit the Release notes to point at the fixed version.

---

## 11 · Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `make release` → "releases are cut from develop" | You're not on `develop`. `git checkout develop`. |
| `make release` → "working tree not clean" | Commit or stash first. |
| `make release` → "version is not higher than latest release" | Bump `package.json` version (§3). |
| `make release` → "local master and origin/master differ" | `git fetch origin master`; if truly diverged, `git branch -f master origin/master` (master is generated — safe to reset to origin). |
| `make release` → "no [Unreleased] section with content" | Add real bullets under `## [Unreleased]` in `CHANGELOG.md`. |
| `vsce publish` → `401 Unauthorized` | PAT expired or wrong scope. Recreate with **Marketplace → Manage** scope (§7), `vsce login` again. |
| `vsce publish` → "missing publisher" | `package.json` `"publisher"` must match your created publisher (`vkushnarenko`). |
| `vsce package` warns about missing `repository`/`LICENSE`/`README` | All present here; if it still warns, run from the repo root, not a subdir. |
| `vsce ls` shows `src/` or `*.ts` or extra files | Add the path to `.vscodeignore`, re-package. |
| `.vsix` is tiny / extension fails at runtime "binary not found" | `make package` didn't run `build-all`. Run `make build-all` then re-`make package`; confirm all 5 `bin/hydragit-server-*` show in `vsce ls`. |
| Users on VSCodium/Cursor "can't find it in the store" | Those use Open VSX — do Path C, or point them at the GitHub `.vsix`. |
| README images don't show on Marketplace | Use absolute `https://raw.githubusercontent.com/...` URLs and make the repo public. |
| Wrong files / want to dry-run | `vsce package` then unzip the `.vsix` (it's a zip) to inspect, or just read `vsce ls`. |

---

## 12 · Command reference card

```bash
# --- release (git side) ---
make release                       # snapshot develop -> master, tag, push

# --- package ---
git checkout vX.Y.Z
make package                       # -> hydragit-X.Y.Z.vsix (all platforms)
vsce ls                            # inspect package contents
git checkout develop

# --- distribute ---
gh release create vX.Y.Z hydragit-X.Y.Z.vsix --title "vX.Y.Z" --notes-from-tag   # GitHub
vsce publish --packagePath hydragit-X.Y.Z.vsix                                    # Marketplace
ovsx publish hydragit-X.Y.Z.vsix -p <TOKEN>                                       # Open VSX

# --- local install test (any path) ---
code --install-extension hydragit-X.Y.Z.vsix --force

# --- one-time setup ---
npm install -g @vscode/vsce ovsx
vsce create-publisher vkushnarenko
vsce login vkushnarenko
ovsx create-namespace vkushnarenko -p <TOKEN>
```

---

### Related docs
- `docs/GITFLOW.md` — the snapshot-release branch model (why master is generated).
- `CHANGELOG.md` — per-version history; the `[Unreleased]` section feeds the release.
