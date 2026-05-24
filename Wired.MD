# Wired

Status of every context-menu item across the three menus we added.

Legend:
- ✅ **Wired** — clicks execute a real action
- ❌ **Missing** — visible placeholder, click is a no-op
- ⚪ **Dim** — intentionally disabled (matches JetBrains styling)

---

## LogPane — commit row right-click

`webview/src/panels/index/components/LogPane.svelte`

| # | Item | Status | Implementation / why missing |
|---|------|--------|------------------------------|
| 1 | Copy Revision Number | ✅ | `navigator.clipboard.writeText(hash)` |
| 2 | Create Patch… | ❌ | Needs new Go cmd: `git format-patch -1 <hash>` + file save dialog |
| 3 | Cherry-Pick | ✅ | IPC `cherrypick { commit }` |
| 4 | Checkout Revision | ✅ | IPC `checkout { branch: hash }` — detaches HEAD |
| 5 | Show Repository at Revision | ❌ | Needs new Go cmd `ls-tree` + new viewer panel; heavy feature |
| 6 | Compare with Local | ❌ | Needs new Go cmd `diff.workingtree`: `git diff <hash>` |
| 7 | Reset Current Branch to Here… | ❌ | Needs new Go cmd `reset { mode, commit }` for `git reset --soft\|mixed\|hard` |
| 8 | Revert Commit | ✅ | IPC `revert { commit }` |
| 9 | Undo Commit… | ⚪ | HEAD-only; low value, can fold into Reset later |
| 10 | Edit Commit Message… | ❌ | HEAD case easy (`commit --amend -m`), older commits need rebase — defer to v0.3 |
| 11 | Fixup… | ⚪ | Needs interactive rebase autosquash — v0.3 |
| 12 | Squash Into… | ⚪ | Needs interactive rebase autosquash — v0.3 |
| 13 | Drop Commit | ❌ | Needs `git rebase --onto <hash>^ <hash>`; risky — defer to v0.3 |
| 14 | Interactively Rebase from Here… | ❌ | Full interactive rebase UI — v0.3 |
| 15 | Push All up to Here… | ❌ | Needs new Go cmd `push.commit`: `git push origin <hash>:<branch>` |
| 16 | New Branch… | ✅ | prompt → IPC `branch.create { name, from: hash }` |
| 17 | New Tag… | ❌ | Needs new Go cmd `tag.create`: `git tag <name> <hash>` |
| 18 | Go to Child Commit | ✅ | Webview-only: scan `commits[]` for `parents.includes(hash)` |
| 19 | Go to Parent Commit | ✅ | Webview-only: `c.parents[0]` → find idx |
| 20 | View in browser | ❌ | Needs new Go cmd `remote.url` (or extend `branches`) to read origin URL; then TS opens via `vscode.env.openExternal()` |

**Wired: 7 / 20**

---

## DetailPane — file row right-click (in commit detail tree)

`webview/src/panels/index/components/DetailPane.svelte`

| # | Item | Status | Implementation / why missing |
|---|------|--------|------------------------------|
| 1 | Show Diff | ✅ | `onSelectFile(path)` loads inline hunks |
| 2 | Show Diff in a New Tab | ✅ | Host cmd `openDiff` → `vscode.diff` editor |
| 3 | Compare with Local | ❌ | Needs new Go cmd `diff.workingtree { commit, file }`: `git diff <hash> -- <path>` |
| 4 | Compare Before with Local | ❌ | Same cmd as above with `<hash>^` |
| 5 | Edit Source | ✅ | New host cmd `openFile` → `vscode.open` on working-tree path |
| 6 | Open Repository Version | ❌ | Needs new Go cmd `show.file { commit, path }`: `git show <hash>:<path>` to a virtual doc |
| 7 | Revert Selected Changes | ❌ | Hunk-level reverse-apply; complex — v0.3 |
| 8 | Cherry-Pick Selected Changes | ❌ | Hunk-level forward-apply; complex — v0.3 |
| 9 | Extract Selected Changes to Separate Commit… | ⚪ | Rebase + new commit — v0.3 |
| 10 | Drop Selected Changes | ⚪ | Reverse-apply specific hunks — v0.3 |
| 11 | Create Patch… | ❌ | Same `format-patch` Go cmd, with `-- <path>` filter |
| 12 | Get from Revision | ❌ | Needs new Go cmd `file.checkout { commit, path }`: `git checkout <hash> -- <path>` |
| 13 | History Up to Here | ❌ | Needs `log.file` Go cmd (already TODO'd at `App.svelte:438`; also needed by file-search) |
| 14 | Show Changes to Parents | ❌ | Merges only; small wrapper that diffs against each parent |

**Wired: 3 / 14**

Note: menu now opens only on file rows (not on folder rows or the toolbar). Right-clicking a folder/toolbar is a no-op so the file-only items don't appear in the wrong context.

---

## Branch context menu — BranchPane right-click

`webview/src/panels/index/components/ContextMenu.svelte`

`<branch>` = the right-clicked branch · `<current>` = the active checked-out branch

| # | Item | Status | Implementation / why missing |
|---|------|--------|------------------------------|
| 1 | Checkout | ✅ | IPC `checkout { branch }` |
| 2 | New Branch from `<branch>`… | ✅ | prompt → IPC `branch.create { name, from }` |
| 3 | Checkout and Rebase onto `<current>` | ✅ | TS-only: composes `checkout(branch)` then `rebase(current)` |
| 4 | Compare with `<current>` | ❌ | Needs new Go cmd `compare.branches { a, b }`: `git log a..b` + `git diff a...b` |
| 5 | Show Diff with Working Tree | ❌ | Same as commit's "Compare with Local" — `git diff <branch>` |
| 6 | Rebase `<current>` onto `<branch>` | ✅ | IPC `rebase { onto: branch }` |
| 7 | Merge `<branch>` into `<current>` | ✅ | IPC `merge { branch }` |
| 8 | Pull into `<current>` Using Rebase | ❌ | Needs to extend `pull` with `mode: 'rebase' \| 'merge'` (uses `--rebase` / `--no-rebase`) |
| 9 | Pull into `<current>` Using Merge | ❌ | Same extended `pull` cmd as above |
| 10 | Delete | ✅ | IPC `branch.delete { name, force }` (disabled when `<branch>` is current) |

**Wired: 6 / 10**

---

## Consolidated list of missing Go work

Each is a small new file in `internal/git/` plus a `case` in `internal/ipc/handler.go`.

| Cmd | Git invocation | Unlocks |
|-----|----------------|---------|
| `tag.create` | `git tag <name> <hash>` (or `-a -m`) | LogPane: New Tag… |
| `reset` | `git reset --{soft\|mixed\|hard} <ref>` | LogPane: Reset Current Branch to Here… |
| `diff.workingtree` | `git diff <ref> [-- <path>]` | LogPane: Compare with Local · DetailPane: Compare with Local + Compare Before with Local · Branch: Show Diff with Working Tree |
| `format-patch` | `git format-patch -1 <hash> [-- <path>]` | LogPane: Create Patch… · DetailPane: Create Patch… |
| `log.file` | `git log --follow --format=… -- <path>` | DetailPane: History Up to Here · also fixes file-search TODO at App.svelte:438 |
| `file.checkout` | `git checkout <ref> -- <path>` | DetailPane: Get from Revision |
| `show.file` | `git show <ref>:<path>` | DetailPane: Open Repository Version |
| `push.commit` | `git push origin <hash>:<branch>` | LogPane: Push All up to Here… |
| `pull` (extend) | add `mode` param → `--rebase` / `--no-rebase` | Branch: Pull into … Using Rebase / Using Merge |
| `remote.url` | `git remote get-url origin` | LogPane: View in browser |
| `compare.branches` | `git log a..b` + `git diff a...b` | Branch: Compare with `<current>` |
| `commit.amend` | `git commit --amend -m <msg>` (HEAD only) | LogPane: Edit Commit Message… (HEAD case) |
| `ls-tree` + viewer | `git ls-tree -r <ref>` + new panel | LogPane: Show Repository at Revision (heavy — v0.3) |
| Hunk-level apply/revert | apply / `--reverse-apply` selected hunks | DetailPane: Revert/Cherry-Pick Selected Changes (complex — v0.3) |
| Drop / interactive rebase | `git rebase --onto`, full UI | LogPane: Drop Commit / Interactively Rebase / Edit older commit msg (v0.3) |

---

## Wired summary

| Menu | Wired | Total | Notes |
|------|-------|-------|-------|
| LogPane (revision) | 7 | 20 | 3 dim by design (Undo/Fixup/Squash) |
| DetailPane (file) | 3 | 14 | 2 dim by design (Extract/Drop Selected) |
| Branch | 6 | 10 | none dim |
| **Overall** | **16** | **44** | 5 dim, 23 missing (need Go work) |
