<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { on, send } from '$shared/messageBus';
  import { uiPrompt, uiConfirm } from '$shared/dialogs';
  import type { Branch, Commit, DiffFile, DiffHunk, Stash, GitStatus, Tag } from './types';

  import Toolbar     from './components/Toolbar.svelte';
  import ActionRail  from './components/ActionRail.svelte';
  import BranchPane  from './components/BranchPane.svelte';
  import PaneDivider from './components/PaneDivider.svelte';
  import LogPane     from './components/LogPane.svelte';
  import DetailPane  from './components/DetailPane.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import InteractiveRebase from './components/InteractiveRebase.svelte';
  import ReflogPane  from './components/ReflogPane.svelte';
  import StatusBar   from './components/StatusBar.svelte';

  // ── Core state ────────────────────────────────────────────────────────────
  let branches:    Branch[]   = [];
  let commits:     Commit[]   = [];
  let filtered:    Commit[]   = [];
  let stashes:     Stash[]    = [];
  let tags:        Tag[]      = [];
  let activeBranch = 'master';
  let selCommitIdx: number | null = null;
  let selStashIdx:  number | null = null;
  let selFile:      string | null = null;
  let diffFiles:    DiffFile[]    = [];
  let diffHunks:    DiffHunk[]    = [];
  // Active ref/range comparison shown in the detail pane (branch/tag/commit
  // "Compare…" / "Show Diff with Working Tree"); null when viewing a commit/stash.
  type Compare =
    | { kind: 'ref'; ref: string; title: string }
    | { kind: 'range'; base: string; head: string; title: string };
  let compare: Compare | null = null;
  // True while the repo is paused mid-rebase (conflict) — drives the
  // Continue/Skip/Abort bar. See commitMenuAction 'drop'.
  let rebaseInProgress = false;
  // "HEAD" undo timeline: when on, the commit graph is replaced by the reflog
  // view and the detail pane is hidden for room. Entered from the HEAD row.
  type ReflogEntry = { hash: string; selector: string; subject: string; date: string };
  let headMode = false;
  let reflog: ReflogEntry[] = [];
  // Open interactive-rebase editor (commits oldest-first + the base to rebase
  // onto); null when closed.
  let rebaseEditor: { base: string; commits: { sha: string; subject: string }[] } | null = null;
  let detailLoading = false;
  let hasPending    = false;   // ahead > 0 → pull button lit

  let sbBranch = 'master';
  let sbInfo   = '';
  let sbCounts = '';
  let iconUri  = document.body.dataset.iconUri ?? '';
  let repoName = 'HydraGit';

  let branchPaneEl: HTMLElement | null = null;
  let detailPaneEl: HTMLElement | null = null;

  // ── Search state ──────────────────────────────────────────────────────────
  type SearchMode = 'msg' | 'hash' | 'file' | 'author';
  let searchMode:  SearchMode = 'msg';
  let searchQuery  = '';
  let allBranches  = false;
  // When in file mode and a result is returned from Go
  let fileSearchActive = false;
  let fileSearchPath   = '';

  // ── Context menus ─────────────────────────────────────────────────────────
  let branchMenu  = { visible: false, x: 0, y: 0, branch: '', isCurrent: false, current: '' };
  let stashMenu   = { visible: false, x: 0, y: 0, label: '' };
  let tagMenu     = { visible: false, x: 0, y: 0, name: '', current: '' };
  let ctxBranch   = '';
  let ctxStashIdx: number | null = null;

  // ── Flash bar ────────────────────────────────────────────────────────────
  let flashMsg   = '';
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  function flash(msg: string, _color = '#febc2e') {
    flashMsg = msg;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashMsg = ''; }, 2200);
  }

  // ── Refresh on .git changes ───────────────────────────────────────────────
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const unsub = on('refresh', () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadAll, 500);
  });
  onDestroy(unsub);

  // ── Load everything ───────────────────────────────────────────────────────
  async function loadAll() {
    try {
      const [status, brs, rawStashes, rawTags] = await Promise.all([
        send<GitStatus>('status'),
        send<Branch[]>('branches'),
        send<Stash[]>('stash'),
        send<Tag[]>('tags'),
      ]);
      // Resolve the current branch before requesting its log, so the initial
      // graph shows HEAD's branch rather than the hardcoded default (and so
      // we don't try to `git log master` in a repo that has no master).
      const current = brs.find(b => b.isCurrent);
      if (current) activeBranch = current.name;
      else if (status.branch) activeBranch = status.branch;

      const rawCommits = await send<Commit[]>('log', { branch: allBranches ? '' : activeBranch, limit: 0 });

      sbBranch    = status.branch || activeBranch;
      sbInfo      = status.ahead || status.behind ? ` · ↑${status.ahead} ↓${status.behind}` : '';
      hasPending  = (status.behind ?? 0) > 0;
      branches    = brs;
      commits     = rawCommits;
      stashes     = rawStashes;
      tags        = rawTags ?? [];
      sbCounts    = `${commits.length} commits · ${branches.filter(b => !b.isRemote).length} branches`;
      // Surface a paused rebase (e.g. a Drop/Edit that hit a conflict) so the
      // Continue/Skip/Abort bar reappears across reloads.
      try {
        const rs = await send<{ inProgress: boolean }>('rebase.status');
        rebaseInProgress = !!rs?.inProgress;
      } catch { /* non-fatal */ }
      // Keep the HEAD undo timeline live while it's open — git activity (here or
      // from another tool) writes the reflog, which loadAll re-reads.
      if (headMode) {
        try {
          reflog = await send<ReflogEntry[]>('reflog');
        } catch { /* non-fatal */ }
      }
      // Re-apply active search filter
      reapplySearch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not a git repository')) {
        console.log('[HydraGit] No git repo detected, suppressing:', msg);
      } else {
        flash('Load error: ' + msg, '#f07070');
      }
    }
  }

  onMount(() => {
    loadAll();
    document.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.ctx-menu, .ctx, .ci, .ctx-item')) {
        e.preventDefault();
      }
    }, true);
  });

  // ── All-branches toggle ───────────────────────────────────────────────────
  async function handleAllBranches(v: boolean) {
    allBranches = v;
    selCommitIdx = null; diffFiles = []; diffHunks = [];
    try {
      commits = await send<Commit[]>('log', { branch: allBranches ? '' : activeBranch, limit: 0 });
      reapplySearch();
    } catch (e: unknown) {
      flash('Log error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Branch select ─────────────────────────────────────────────────────────
  async function selectBranch(name: string, _remote: boolean) {
    selStashIdx = null;
    compare = null;
    headMode = false; // selecting a branch exits the undo timeline
    activeBranch = name;
    selCommitIdx = null; selFile = null; diffFiles = []; diffHunks = [];
    try {
      commits = await send<Commit[]>('log', { branch: allBranches ? '' : name, limit: 0 });
      reapplySearch();
    } catch (e: unknown) {
      flash('Log error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Search / filter ───────────────────────────────────────────────────────
  // Client-side filter — used for hash-prefix jumps and as the "no query" reset.
  function applyFilter() {
    if (fileSearchActive) return; // file mode uses its own commits list
    const q = searchQuery.trim().toLowerCase();
    if (!q) { filtered = [...commits]; return; }
    if (searchMode === 'hash') {
      filtered = commits.filter(c => (c.hash ?? '').toLowerCase().startsWith(q));
    } else {
      filtered = [...commits];
    }
    selCommitIdx = null; diffFiles = []; diffHunks = [];
  }

  // Server-side filter for message/author — re-runs `git log --grep/--author` so
  // the Go side recomputes lane layout over the matching commits. A client-side
  // row filter would desync the graph (lanes are laid out over the full set).
  let filterTimer: ReturnType<typeof setTimeout>;
  async function runServerFilter() {
    const q = searchQuery.trim();
    if (!q) { filtered = [...commits]; selCommitIdx = null; return; }
    const params: Record<string, unknown> = { branch: allBranches ? '' : activeBranch, limit: 0 };
    if (searchMode === 'msg')    params.grep = q;
    if (searchMode === 'author') params.author = q;
    try {
      filtered = await send<Commit[]>('log', params);
      selCommitIdx = null; diffFiles = []; diffHunks = [];
    } catch (e: unknown) {
      flash('Filter error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // Re-apply whatever filter is active (after a branch switch or log reload).
  function reapplySearch() {
    if ((searchMode === 'msg' || searchMode === 'author') && searchQuery.trim()) {
      runServerFilter();
    } else {
      applyFilter();
    }
  }

  async function handleSearch(q: string) {
    searchQuery = q;
    if (searchMode === 'file') {
      if (!q.trim()) {
        // clear file search, restore normal log
        fileSearchActive = false;
        fileSearchPath   = '';
        filtered = [...commits];
        selCommitIdx = null; diffFiles = []; diffHunks = [];
      }
      // file search triggers on Enter — see handleSearchKey
      return;
    }
    if (searchMode === 'hash') { applyFilter(); return; }
    // message / author → debounced server-side filter (keeps the graph correct).
    clearTimeout(filterTimer);
    filterTimer = setTimeout(runServerFilter, 250);
  }

  async function handleSearchKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' || searchMode !== 'file' || !searchQuery.trim()) return;
    fileSearchPath   = searchQuery.trim();
    fileSearchActive = true;
    selCommitIdx = null; diffFiles = []; diffHunks = [];
    flash(`Searching commits for: ${fileSearchPath}…`);
    try {
      const result = await send<Commit[]>('log.file', { path: fileSearchPath });
      filtered = result;
      flash(`${result.length} commit${result.length !== 1 ? 's' : ''} touched ${fileSearchPath}`, '#4ec94e');
    } catch (e: unknown) {
      flash('File search failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
      fileSearchActive = false;
    }
  }

  function handleModeChange(m: SearchMode) {
    searchMode = m;
    searchQuery = '';
    // Switching to any non-file mode clears the active filter → show the full
    // log (the query is reset, so there's nothing to filter by yet).
    if (m !== 'file') {
      fileSearchActive = false;
      fileSearchPath   = '';
      filtered = [...commits];
      selCommitIdx = null; diffFiles = []; diffHunks = [];
    }
  }

  // ── Commit select ─────────────────────────────────────────────────────────
  async function selectCommit(i: number) {
    selStashIdx = null;
    compare = null;
    selCommitIdx = i;
    selFile = null; diffFiles = []; diffHunks = [];
    detailLoading = true;
    const c = filtered[i];
    try {
      const files = await send<DiffFile[]>('diff', { commit: c.hash });
      diffFiles = files;
      detailLoading = false;
      if (files.length) selectDiffFile(files[0].path);
    } catch (e: unknown) {
      detailLoading = false;
      flash('Diff error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  async function selectDiffFile(path: string) {
    selFile = path;
    diffHunks = [];
    // Compare mode loads hunks from the ref/range diff, not a commit.
    if (compare) {
      try {
        diffHunks = await send<DiffHunk[]>(
          compare.kind === 'ref' ? 'diff.ref' : 'diff.range',
          compare.kind === 'ref'
            ? { ref: compare.ref, file: path }
            : { base: compare.base, head: compare.head, file: path }
        );
      } catch (e: unknown) {
        flash('Diff error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
      }
      return;
    }
    if (selCommitIdx === null) return;
    try {
      diffHunks = await send<DiffHunk[]>('diff', {
        commit: filtered[selCommitIdx].hash,
        file: path,
      });
    } catch (e: unknown) {
      flash('Diff error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // Open a ref-vs-working or ref-vs-ref comparison in the detail pane.
  async function startCompare(spec: Compare) {
    selCommitIdx = null; selStashIdx = null; selFile = null;
    diffFiles = []; diffHunks = [];
    compare = spec;
    detailLoading = true;
    try {
      const files = await send<DiffFile[]>(
        spec.kind === 'ref' ? 'diff.ref' : 'diff.range',
        spec.kind === 'ref' ? { ref: spec.ref } : { base: spec.base, head: spec.head }
      );
      diffFiles = files;
      detailLoading = false;
      if (files.length) selectDiffFile(files[0].path);
    } catch (e: unknown) {
      detailLoading = false;
      flash('Compare failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Tag select ────────────────────────────────────────────────────────────
  async function selectTagCommit(hash: string) {
    const match = (c: Commit) => c.hash.startsWith(hash) || hash.startsWith(c.hash);
    let idx = filtered.findIndex(match);
    if (idx === -1) {
      const branch = await send<string>('branch.containing', { commit: hash });
      if (branch) {
        await selectBranch(branch, false);
        idx = filtered.findIndex(match);
      }
    }
    if (idx !== -1) selectCommit(idx);
  }

  // ── Stash ─────────────────────────────────────────────────────────────────
  async function selectStash(i: number) {
    compare = null;
    selStashIdx = i;
    const s = stashes[i];
    const idx = s.index ?? i;
    try {
      const [files, hunks] = await Promise.all([
        send<DiffFile[]>('stash.files', { index: idx }),
        send<DiffHunk[]>('stash.show', { index: idx }),
      ]);
      diffFiles = files;
      diffHunks = hunks;
      selCommitIdx = null;
      selFile = null;
      // Stash message: "On <branch>: ..." or "WIP on <branch>: ..."
      const stashMsg = s.msg ?? s.message ?? '';
      const branchMatch = stashMsg.match(/^(?:WIP )?[Oo]n (.+?):/);
      if (branchMatch && branchMatch[1] !== activeBranch) {
        await selectBranch(branchMatch[1], false);
      }
    } catch (e: unknown) {
      flash('Show failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  async function stashAction(a: string) {
    if (selStashIdx === null) return;
    const s   = stashes[selStashIdx];
    const idx = s.index ?? selStashIdx;

    // Non-mutating: just render the stash's changes in the detail pane.
    if (a === 'show-diff' || a === 'show-diff-tab') {
      await selectStash(selStashIdx);
      return;
    }

    // 'unstash' is the verbose form of pop (apply + remove); 'clear' drops every
    // entry, so it takes no index.
    const cmdMap: Record<string, string> = {
      pop: 'stash.pop', apply: 'stash.apply', drop: 'stash.drop',
      unstash: 'stash.pop', clear: 'stash.clear',
    };
    const cmd = cmdMap[a];
    if (!cmd) return;
    const target = a === 'clear' ? 'all stashes' : `stash@{${idx}}`;
    // 'clear' deletes every stash and cannot be undone — confirm via the host.
    if (a === 'clear' && !(await uiConfirm('Drop all stashes? This cannot be undone.'))) {
      return;
    }
    try {
      await send(cmd, a === 'clear' ? {} : { index: idx });
      flash(`${a} ${target} done`, '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      flash(`${a} failed: ` + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Toolbar / rail actions ────────────────────────────────────────────────
  async function tbAction(a: string) {
    if (a === 'refresh') { loadAll(); return; }
    flash({ fetch: 'Fetching…', pull: 'Pulling…', push: 'Pushing…' }[a] ?? a);
    try {
      await send(a);
      flash(a + ' done', '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      flash(a + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  async function railAction(a: string) {
    if (a === 'sync') {
      // One-click "bring me up to date": fetch all remotes, then integrate the
      // current branch (uses the user's configured pull mode). No push — that
      // stays a deliberate, separate action.
      flash('Syncing…');
      try {
        await send('fetch');
        await send('pull');
        flash('Synced', '#4ec94e');
        loadAll();
      } catch (e: unknown) {
        flash('Sync failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
      }
      return;
    }
    if (a === 'branch.new') {
      const name = await uiPrompt('New branch name:');
      if (name) {
        try {
          await send('branch.create', { name });
          flash(`Created ${name}`, '#4ec94e');
          loadAll();
        } catch (e: unknown) {
          flash('Create failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
        }
      }
      return;
    }
    if (a === 'branch.delete') {
      // Use VS Code's showWarningMessage for a native confirmation dialog
      // We can't call VS Code APIs directly from the webview, so we send a
      // special command to the extension host which shows the dialog and
      // only deletes if confirmed.
      const name = await uiPrompt(`Delete branch — enter branch name (cannot delete current branch):`);
      if (!name) return;
      if (name === activeBranch) {
        flash(`Cannot delete the current branch: ${name}`, '#f07070');
        return;
      }
      // Confirmation via the host (native VS Code modal) — see $shared/dialogs.
      const confirmed = await uiConfirm(
        `Delete branch "${name}"?\n\nThis cannot be undone. The branch will be deleted locally.`
      );
      if (!confirmed) return;
      flash(`Deleting ${name}…`);
      try {
        await send('branch.delete', { name, force: false });
        flash(`Deleted ${name}`, '#4ec94e');
        loadAll();
      } catch (e: unknown) {
        // Likely "not fully merged" — offer force delete
        const msg = e instanceof Error ? e.message : String(e);
        const force = await uiConfirm(
          `Could not delete "${name}":\n${msg}\n\nForce delete? (data may be lost)`
        );
        if (force) {
          try {
            await send('branch.delete', { name, force: true });
            flash(`Force deleted ${name}`, '#4ec94e');
            loadAll();
          } catch (e2: unknown) {
            flash('Force delete failed: ' + (e2 instanceof Error ? e2.message : String(e2)), '#f07070');
          }
        }
      }
      return;
    }
    if (a === 'merge') {
      const target = await uiPrompt('Merge branch into current — branch name:');
      if (target) {
        flash(`Merging ${target}…`);
        try { await send('merge', { branch: target }); flash(`Merged ${target}`, '#4ec94e'); loadAll(); }
        catch (e: unknown) { flash('Merge failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070'); }
      }
      return;
    }
    if (a === 'rebase') {
      const onto = await uiPrompt('Rebase onto branch:');
      if (onto) {
        flash(`Rebasing onto ${onto}…`);
        try { await send('rebase', { onto }); flash('Rebased', '#4ec94e'); loadAll(); }
        catch (e: unknown) { flash('Rebase failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070'); }
      }
      return;
    }
    if (a === 'tag') {
      const name = await uiPrompt('New tag name (at HEAD):');
      if (!name) return;
      const message = (await uiPrompt(`Annotation message for "${name}" (leave empty for lightweight tag):`)) ?? '';
      try {
        await send('tag.create', { name, commit: '', message });
        flash(`Created tag ${name}`, '#4ec94e');
        loadAll();
      } catch (e: unknown) {
        flash('Tag failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
      }
      return;
    }
    // stash.save, fetch, pull, push
    await tbAction(a);
  }

  // ── Commit actions ────────────────────────────────────────────────────────
  async function commitAction(action: string, hash: string) {
    if (action === 'copy') { flash('Copied: ' + hash, '#4ec94e'); return; }
    flash(`${action}: ${hash}`);
    const cmdMap: Record<string, string> = { 'cherry-pick': 'cherrypick', revert: 'revert' };
    try {
      await send(cmdMap[action] ?? action, { commit: hash });
      flash(action + ' done', '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      flash(action + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Commit context menu (LogPane) ────────────────────────────────────────
  async function commitMenuAction(action: string, commit: Commit) {
    const hash = commit.hash;
    const acts: Record<string, () => Promise<void>> = {
      'copy-hash': async () => {
        await navigator.clipboard.writeText(hash);
        flash(`Copied: ${hash.slice(0, 7)}`, '#4ec94e');
      },
      'cherry-pick': async () => {
        await send('cherrypick', { commit: hash });
        flash(`Cherry-picked ${hash.slice(0, 7)}`, '#4ec94e');
        loadAll();
      },
      checkout: async () => {
        await send('checkout', { branch: hash });
        flash(`Checked out ${hash.slice(0, 7)} (detached HEAD)`, '#4ec94e');
        loadAll();
      },
      revert: async () => {
        await send('revert', { commit: hash });
        flash(`Reverted ${hash.slice(0, 7)}`, '#4ec94e');
        loadAll();
      },
      'new-branch': async () => {
        const name = await uiPrompt('New branch name:');
        if (!name) return;
        await send('branch.create', { name, from: hash });
        flash(`Created ${name}`, '#4ec94e');
        loadAll();
      },
      'new-tag': async () => {
        const name = await uiPrompt(`New tag at ${hash.slice(0, 7)}:`);
        if (!name) return;
        const message = (await uiPrompt(`Annotation message for "${name}" (leave empty for lightweight tag):`)) ?? '';
        await send('tag.create', { name, commit: hash, message });
        flash(`Created tag ${name}`, '#4ec94e');
        loadAll();
      },
      'view-in-browser': async () => {
        send('openCommitUrl', { commit: hash });
      },
      'compare-local': async () => {
        await startCompare({ kind: 'ref', ref: hash, title: `${hash.slice(0, 7)} ↔ working tree` });
      },
      'interactive-rebase': async () => {
        const idx = filtered.findIndex((c) => c.hash === hash);
        if (idx < 0) return;
        const base = (commit.parents ?? [])[0];
        if (!base) { flash('Cannot interactively rebase the root commit', '#f07070'); return; }
        // filtered is newest-first; the editor wants oldest-first.
        const range = filtered.slice(0, idx + 1).slice().reverse();
        rebaseEditor = {
          base,
          commits: range.map((c) => ({ sha: c.hash, subject: c.message ?? c.msg ?? '' })),
        };
      },
      'edit-message': async () => {
        const current = commit.message ?? commit.msg ?? '';
        const msg = await uiPrompt('New commit message:', current);
        if (msg === null) return;        // cancelled
        if (!msg.trim()) { flash('Empty message — cancelled', '#f07070'); return; }
        if (msg === current) return;      // unchanged
        flash(`Rewording ${hash.slice(0, 7)}…`);
        const res = await send<{ conflict: boolean }>('rebase.reword', { commit: hash, message: msg });
        if (res?.conflict) {
          rebaseInProgress = true;
          flash('Rebase paused on a conflict — resolve, then Continue', '#e0a030');
        } else {
          flash('Commit message updated', '#4ec94e');
        }
        loadAll();
      },
      drop: async () => {
        if (!(await uiConfirm(
          `Drop commit ${hash.slice(0, 7)}?\n\nThis rewrites history by rebasing later commits onto its parent.`
        ))) return;
        flash(`Dropping ${hash.slice(0, 7)}…`);
        const res = await send<{ conflict: boolean }>('rebase.drop', { commit: hash });
        if (res?.conflict) {
          rebaseInProgress = true;
          flash('Rebase paused on a conflict — resolve, then Continue', '#e0a030');
        } else {
          flash(`Dropped ${hash.slice(0, 7)}`, '#4ec94e');
        }
        loadAll();
      },
      'create-patch': async () => {
        const patch = await send<string>('patch.format', { commit: hash });
        // savePatch is host-only (native save dialog) — fire and forget.
        send('savePatch', { content: patch, name: `${hash.slice(0, 7)}.patch` });
      },
      'push-here': async () => {
        if (!(await uiConfirm(
          `Push all commits up to ${hash.slice(0, 7)} onto origin/${activeBranch}?`
        ))) return;
        flash(`Pushing up to ${hash.slice(0, 7)}…`);
        await send('push.upto', { commit: hash, branch: activeBranch });
        flash(`Pushed up to ${hash.slice(0, 7)}`, '#4ec94e');
        loadAll();
      },
      reset: async () => {
        const raw = await uiPrompt(
          `Reset current branch to ${hash.slice(0, 7)} — mode (soft / mixed / hard):`,
          'mixed'
        );
        if (!raw) return;
        const mode = raw.trim().toLowerCase();
        if (mode !== 'soft' && mode !== 'mixed' && mode !== 'hard') {
          flash(`Unknown reset mode: ${raw}`, '#f07070');
          return;
        }
        if (mode === 'hard' && !(await uiConfirm(
          `Hard reset to ${hash.slice(0, 7)}?\n\nAny uncommitted changes are auto-stashed first (recoverable).`
        ))) return;
        const res = await send<{ stashed: boolean }>('reset', { commit: hash, mode });
        flash(
          res?.stashed
            ? `Reset (${mode}) to ${hash.slice(0, 7)} — changes auto-stashed`
            : `Reset (${mode}) to ${hash.slice(0, 7)}`,
          res?.stashed ? '#e0a030' : '#4ec94e'
        );
        loadAll();
      },
    };
    try {
      await acts[action]?.();
    } catch (e: unknown) {
      flash(action + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // The editor's "Start Rebasing" is itself the review/confirm step (the full
  // plan is shown), so no extra modal — matches IntelliJ/GitLens.
  async function startInteractiveRebase(items: { sha: string; action: string }[]) {
    const ed = rebaseEditor;
    rebaseEditor = null;
    if (!ed) return;
    flash('Rebasing…');
    try {
      const res = await send<{ conflict: boolean }>('rebase.interactive', {
        base: ed.base,
        items,
      });
      if (res?.conflict) {
        rebaseInProgress = true;
        flash('Rebase paused on a conflict — resolve, then Continue', '#e0a030');
      } else {
        flash('Interactive rebase complete', '#4ec94e');
      }
      loadAll();
    } catch (e: unknown) {
      flash('Rebase failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── HEAD undo timeline (reflog) ─────────────────────────────────────────────
  async function enterHeadMode() {
    try {
      reflog = await send<ReflogEntry[]>('reflog');
      headMode = true;
    } catch (e: unknown) {
      flash('Reflog error: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  function exitHeadMode() {
    headMode = false;
  }

  async function reflogReset(hash: string, mode: 'soft' | 'mixed' | 'hard') {
    const warn =
      mode === 'hard'
        ? `\n\nAny uncommitted changes are auto-stashed first (recoverable).`
        : mode === 'mixed'
          ? `\n\nChanges are kept but unstaged.`
          : `\n\nChanges are kept and staged.`;
    if (!(await uiConfirm(`${mode} reset to ${hash.slice(0, 7)}?${warn}`))) return;
    try {
      const res = await send<{ stashed: boolean }>('reset', { commit: hash, mode });
      const msg = res?.stashed
        ? `${mode} reset to ${hash.slice(0, 7)} — changes auto-stashed`
        : `${mode} reset to ${hash.slice(0, 7)}`;
      flash(msg, res?.stashed ? '#e0a030' : mode === 'hard' ? '#f07070' : '#4ec94e');
      headMode = false;
      loadAll();
    } catch (e: unknown) {
      flash('Reset failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Rebase conflict controls (GitLens/IntelliJ pause-on-conflict flow) ──────
  async function rebaseControl(kind: 'continue' | 'skip' | 'abort') {
    try {
      if (kind === 'abort') {
        await send('rebase.abort');
        rebaseInProgress = false;
        flash('Rebase aborted', '#4ec94e');
      } else {
        const res = await send<{ conflict: boolean }>(`rebase.${kind}`);
        rebaseInProgress = !!res?.conflict;
        flash(res?.conflict ? 'Still conflicting — resolve, then Continue' : 'Rebase complete',
          res?.conflict ? '#e0a030' : '#4ec94e');
      }
      loadAll();
    } catch (e: unknown) {
      flash(`Rebase ${kind} failed: ` + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // ── Branch context menu ───────────────────────────────────────────────────
  function showBranchCtx(e: MouseEvent, name: string, isCurrent: boolean) {
    e.preventDefault(); e.stopPropagation();
    ctxBranch  = name;
    branchMenu = {
      visible: true, isCurrent, branch: name, current: activeBranch,
      x: Math.min(e.clientX, window.innerWidth - 320),
      y: Math.min(e.clientY, window.innerHeight - 280),
    };
  }

  async function branchAction(a: string) {
    branchMenu = { ...branchMenu, visible: false };
    const acts: Record<string, () => Promise<void>> = {
      checkout:  async () => { await send('checkout', { branch: ctxBranch });                flash(`Checked out ${ctxBranch}`, '#4ec94e'); loadAll(); },
      merge:     async () => { await send('merge',    { branch: ctxBranch });                flash(`Merged ${ctxBranch}`, '#4ec94e');     loadAll(); },
      rebase:    async () => { await send('rebase',   { onto:   ctxBranch });                flash('Rebased', '#4ec94e');                 loadAll(); },
      push:      async () => { await send('push',     { branch: ctxBranch });                flash(`Pushed ${ctxBranch}`, '#4ec94e');     loadAll(); },
      delete:    async () => { await send('branch.delete', { name: ctxBranch, force: false }); flash(`Deleted ${ctxBranch}`, '#f07070'); loadAll(); },
      copy:      async () => { flash(`Copied: ${ctxBranch}`, '#4ec94e'); },
      rename:    async () => {
        const to = await uiPrompt('New name:');
        if (to) { await send('branch.rename', { from: ctxBranch, to }); flash(`Renamed to ${to}`, '#4ec94e'); loadAll(); }
      },
      'new-from': async () => {
        const name = await uiPrompt('Branch name:');
        if (name) { await send('branch.create', { name, from: ctxBranch }); flash(`Created ${name}`, '#4ec94e'); loadAll(); }
      },
      'checkout-rebase': async () => {
        const onto = branchMenu.current;
        await send('checkout', { branch: ctxBranch });
        await send('rebase', { onto });
        flash(`Checked out ${ctxBranch} and rebased onto ${onto}`, '#4ec94e');
        loadAll();
      },
      'pull-rebase': async () => {
        flash('Pulling (rebase)…');
        await send('pull.mode', { mode: 'rebase' });
        flash('Pulled with rebase', '#4ec94e');
        loadAll();
      },
      'pull-merge': async () => {
        flash('Pulling (merge)…');
        await send('pull.mode', { mode: 'merge' });
        flash('Pulled with merge', '#4ec94e');
        loadAll();
      },
      'diff-working': async () => {
        await startCompare({ kind: 'ref', ref: ctxBranch, title: `${ctxBranch} ↔ working tree` });
      },
      compare: async () => {
        const base = branchMenu.current;
        await startCompare({ kind: 'range', base, head: ctxBranch, title: `${base} … ${ctxBranch}` });
      },
    };
    try { await acts[a]?.(); }
    catch (e: unknown) { flash(a + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070'); }
  }

  // ── Stash context menu ────────────────────────────────────────────────────
  function showStashCtx(e: MouseEvent, i: number) {
    e.preventDefault(); e.stopPropagation();
    ctxStashIdx = i;
    stashMenu   = {
      visible: true,
      label: `stash@{${stashes[i].index ?? i}}`,
      x: Math.min(e.clientX, window.innerWidth - 160),
      y: Math.min(e.clientY, window.innerHeight - 160),
    };
  }

  async function stashCtxAction(a: string) {
    stashMenu = { ...stashMenu, visible: false };
    if (ctxStashIdx === null) return;
    selStashIdx = ctxStashIdx;
    await stashAction(a);
  }

  // ── Tag context menu ──────────────────────────────────────────────────────
  function showTagCtx(e: MouseEvent, name: string) {
    e.preventDefault(); e.stopPropagation();
    tagMenu = {
      visible: true, name, current: activeBranch,
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 120),
    };
  }

  async function tagCtxAction(a: string) {
    const name = tagMenu.name;
    tagMenu = { ...tagMenu, visible: false };
    try {
      switch (a) {
        case 'checkout':
          flash(`Checking out tag ${name}…`);
          await send('checkout', { branch: name });
          flash(`Checked out ${name}`, '#4ec94e');
          loadAll();
          break;
        case 'diff-working':
          await startCompare({ kind: 'ref', ref: name, title: `${name} ↔ working tree` });
          break;
        case 'merge':
          await send('merge', { branch: name });
          flash(`Merged ${name} into ${activeBranch}`, '#4ec94e');
          loadAll();
          break;
        case 'push':
          await send('push', { branch: name, tags: true });
          flash(`Pushed tag ${name} to origin`, '#4ec94e');
          break;
        case 'delete':
          await send('tag.delete', { name });
          flash(`Deleted tag ${name}`, '#4ec94e');
          loadAll();
          break;
      }
    } catch (e: unknown) {
      flash(`${a} failed: ` + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  function closeMenus() {
    branchMenu = { ...branchMenu, visible: false };
    stashMenu  = { ...stashMenu,  visible: false };
    tagMenu    = { ...tagMenu,    visible: false };
  }
</script>

<svelte:window
  on:click={closeMenus}
  on:keydown={(e) => {
    if (e.key === 'Escape') closeMenus();
    if (e.key === 'Enter') handleSearchKey(e);
  }}
/>

<div class="app-root">
  <Toolbar
    {repoName}
    {iconUri}
    {activeBranch}
    {branches}
    {hasPending}
    {allBranches}
    {searchMode}
    {searchQuery}
    onAction={tbAction}
    onSearch={handleSearch}
    onModeChange={handleModeChange}
    onAllBranches={handleAllBranches}
    onSelectBranch={selectBranch}
  />

  {#if rebaseEditor}
    <InteractiveRebase
      commits={rebaseEditor.commits}
      onStart={startInteractiveRebase}
      onCancel={() => (rebaseEditor = null)}
    />
  {/if}

  {#if rebaseInProgress}
    <div class="rebase-bar">
      <span class="rebase-bar-msg">⚠ Rebase in progress — resolve conflicts, then continue.</span>
      <div class="rebase-bar-actions">
        <button class="rebase-btn" on:click={() => rebaseControl('continue')}>Continue</button>
        <button class="rebase-btn" on:click={() => rebaseControl('skip')}>Skip</button>
        <button class="rebase-btn rebase-btn--danger" on:click={() => rebaseControl('abort')}>Abort</button>
      </div>
    </div>
  {/if}

  <div class="main">
    <ActionRail {hasPending} onAction={railAction} />

    <div bind:this={branchPaneEl} class="branch-wrap">
      <BranchPane
        {branches}
        {stashes}
        {tags}
        {activeBranch}
        {selStashIdx}
        onSelectBranch={selectBranch}
        onHead={enterHeadMode}
        onSelectStash={selectStash}
        onStashAction={stashAction}
        onNewBranch={() => railAction('branch.new')}
        onBranchCtx={showBranchCtx}
        onStashCtx={showStashCtx}
        onTagCtx={showTagCtx}
        onTagSelect={selectTagCommit}
      />
    </div>

    <PaneDivider leftEl={branchPaneEl} isRight={false} />

    {#if headMode}
      <!-- Undo timeline takes the whole graph+detail area for room. -->
      <ReflogPane
        entries={reflog}
        {activeBranch}
        onReset={reflogReset}
        onExit={exitHeadMode}
      />
    {:else}
      <LogPane
        commits={filtered}
        selectedIdx={selCommitIdx}
        onSelect={selectCommit}
        onCtx={() => {}}
        onCommitAction={commitMenuAction}
        {fileSearchActive}
        {fileSearchPath}
      />

      <PaneDivider rightEl={detailPaneEl} isRight={true} />

      <div bind:this={detailPaneEl} class="detail-wrap">
        <DetailPane
          commit={selCommitIdx !== null ? filtered[selCommitIdx] : null}
          stash={selStashIdx !== null ? stashes[selStashIdx] : null}
          {compare}
          files={diffFiles}
          hunks={diffHunks}
          {selFile}
          loading={detailLoading}
          {iconUri}
          onSelectFile={selectDiffFile}
          onCommitAction={commitAction}
          onStashAction={stashAction}
        />
      </div>
    {/if}
  </div>

  <StatusBar
    branch={sbBranch}
    info={sbInfo}
    countsText={flashMsg ? `⚡ ${flashMsg}` : sbCounts}
    {iconUri}
  />

  <ContextMenu
    {branchMenu}
    {stashMenu}
    {tagMenu}
    onBranchAction={branchAction}
    onStashAction={stashCtxAction}
    onTagAction={tagCtxAction}
  />
</div>

<style>
  .app-root {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
  .main {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .rebase-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 5px 12px;
    background: rgba(224, 160, 48, 0.13);
    border-bottom: 0.5px solid rgba(224, 160, 48, 0.4);
    color: #e0a030;
    font-size: var(--hg-font-sm);
    flex-shrink: 0;
  }
  .rebase-bar-actions { display: flex; gap: 6px; }
  .rebase-btn {
    padding: 2px 10px;
    font-size: var(--hg-font-xs);
    color: var(--vscode-button-foreground, #fff);
    background: var(--vscode-button-background, #0e639c);
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }
  .rebase-btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  .rebase-btn--danger { background: #a33; }
  .rebase-btn--danger:hover { background: #c44; }
  .branch-wrap,
  .detail-wrap {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    flex-shrink: 0;
  }
</style>
