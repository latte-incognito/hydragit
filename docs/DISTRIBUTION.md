# HydraGit — Distribution Options

---

## Option A — Bundle binaries in .vsix (current plan)

Ship all 4 platform binaries inside the `.vsix`. Simple, self-contained.

**What you need:**
- `make build-all` — cross-compile all 4 platforms
- Binaries committed to `bin/` or built in CI before `vsce package`
- Nothing else

**Mac problem:** unsigned binaries trigger Gatekeeper. Users need to run:
```bash
xattr -dr com.apple.quarantine ~/.vscode/extensions/vkushnarenko.hydragit-0.1.0/bin/
```
Document this in README under a macOS section.

**Cost:** $0

---

## Option B — Download binary on first activation (recommended)

`.vsix` ships with no binaries. On first run, extension downloads the right binary from GitHub Releases.

**What you need:**

1. **GitHub repo** — public, free
2. **GitHub Actions** — `.github/workflows/release.yml` — builds all 4 platforms on `git tag`, uploads to GitHub Releases automatically
3. **`ensureBinary()` in `extension.ts`** — checks if binary exists, downloads if not, shows progress notification
4. **Remove `bin/` from `.vsix`** — update `.vscodeignore`

**No Mac problem.** Programmatic downloads don't get quarantine xattr.

**Cost:** $0

---

## Option C — Signed + Notarized binaries (professional)

Same as A or B but binaries are signed with Apple certificate. No xattr, no warnings, fully transparent to users.

**What you need:**
- Apple Developer account — $99/year
- `codesign` + `xcrun notarytool` in your build pipeline
- Works with either A (bundle in vsix) or B (GitHub Releases)

**Cost:** $99/year

---

## Comparison

| | A — Bundle | B — GitHub Releases | C — Signed |
|---|---|---|---|
| .vsix size | ~15MB | ~50KB | ~15MB or ~50KB |
| Mac Gatekeeper | xattr workaround | No problem | No problem |
| Needs GitHub repo | No | Yes | No |
| Needs CI setup | No | Yes | No |
| Needs Apple account | No | No | Yes |
| Cost | $0 | $0 | $99/year |

---

## Recommendation

**Start with A** — ship v0.1 fast, document the xattr line in README.
**Move to B** — before v0.2, set up GitHub Actions + download on first run. Cleaner, smaller, no Mac headache.
**Consider C** — when the extension has real users and you want it to feel fully professional.
