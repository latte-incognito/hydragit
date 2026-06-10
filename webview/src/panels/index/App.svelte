<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { on, send } from '$shared/messageBus';
  import { uiPrompt, uiConfirm, uiPick, uiNotify } from '$shared/dialogs';
  import { repoState, requestRepoState, openRepoPicker } from '$shared/repoStore';
  import type { Branch, Commit, DiffFile, DiffHunk, Stash, GitStatus, Tag, Worktree } from './types';
  import { planSync } from './syncPlan';

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
  let branches:    Branch[]   = $state([]);
  let commits:     Commit[]   = [];
  let filtered:    Commit[]   = $state([]);
  let stashes:     Stash[]    = $state([]);
  let tags:        Tag[]      = $state([]);
  let worktrees:   Worktree[] = $state([]);
  let activeBranch = $state('master');
  let selCommitIdx: number | null = $state(null);
  let selStashIdx:  number | null = $state(null);
  let selFile:      string | null = $state(null);
  let diffFiles:    DiffFile[]    = $state([]);
  let diffHunks:    DiffHunk[]    = $state([]);
  // Active ref/range comparison shown in the detail pane (branch/tag/commit
  // "Compare…" / "Show Diff with Working Tree"); null when viewing a commit/stash.
  type Compare =
    | { kind: 'ref'; ref: string; title: string }
    | { kind: 'range'; base: string; head: string; title: string };
  let compare: Compare | null = $state(null);
  // True while the repo is paused mid-rebase (conflict) — drives the
  // Continue/Skip/Abort bar. See commitMenuAction 'drop'.
  let rebaseInProgress = $state(false);
  // HEAD is detached (not on a branch) — drives the calm "create a branch" banner.
  let detached = $state(false);
  // No user.name / user.email configured — drives the "set up git identity" banner.
  let identityMissing = $state(false);
  // "HEAD" undo timeline: when on, the commit graph is replaced by the reflog
  // view and the detail pane is hidden for room. Entered from the HEAD row.
  type ReflogEntry = { hash: string; selector: string; subject: string; date: string };
  let headMode = $state(false);
  let reflog: ReflogEntry[] = $state([]);
  // Open interactive-rebase editor (commits oldest-first + the base to rebase
  // onto); null when closed.
  let rebaseEditor: { base: string; commits: { sha: string; subject: string }[] } | null = $state(null);
  let detailLoading = $state(false);
  let hasPending    = $state(false);   // ahead > 0 → pull button lit

  let sbBranch = $state('master');
  let sbInfo   = $state('');
  let sbInfoTitle = $state(''); // raw ↑/↓ symbols, shown as a tooltip for git pros
  let sbCounts = $state('');

  // Plain-language ahead/behind (ideas.md): "↑2 ↓1" → "2 to push, 1 to pull".
  function aheadBehindText(ahead: number, behind: number): string {
    const parts: string[] = [];
    if (ahead) parts.push(`${ahead} to push`);
    if (behind) parts.push(`${behind} to pull`);
    return parts.length ? ' · ' + parts.join(', ') : '';
  }
  let iconUri  = document.body.dataset.iconUri ?? '';
  // Multi-repo breadcrumb: the active repo's name, shown before the branch in
  // the status bar (repo ▸ branch). Empty in single-repo workspaces → hidden.
  let repoName = $derived(
    $repoState.repos.length > 1
      ? ($repoState.repos.find((r) => r.rootPath === $repoState.active)?.name ?? '')
      : ''
  );

  let branchPaneEl: HTMLElement | null = $state(null);
  let detailPaneEl: HTMLElement | null = $state(null);

  // ── Search state ──────────────────────────────────────────────────────────
  type SearchMode = 'msg' | 'hash' | 'file' | 'author';
  let searchMode:  SearchMode = $state('msg');
  let searchQuery  = $state('');
  let allBranches  = $state(false);
  // When in file mode and a result is returned from Go
  let fileSearchActive = $state(false);
  let fileSearchPath   = $state('');

  // ── Context menus ─────────────────────────────────────────────────────────
  let branchMenu  = $state({ visible: false, x: 0, y: 0, branch: '', isCurrent: false, current: '' });
  let stashMenu   = $state({ visible: false, x: 0, y: 0, label: '' });
  let tagMenu     = $state({ visible: false, x: 0, y: 0, name: '', current: '' });
  let worktreeMenu = $state({ visible: false, x: 0, y: 0, wt: null as Worktree | null });
  let ctxBranch   = '';
  let ctxStashIdx: number | null = null;
  let ctxWorktree: Worktree | null = null;

  // ── Flash bar ────────────────────────────────────────────────────────────
  let flashMsg   = $state('');
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
      const [status, brs, rawStashes, rawTags, rawWorktrees, user] = await Promise.all([
        send<GitStatus>('status'),
        send<Branch[]>('branches'),
        send<Stash[]>('stash'),
        send<Tag[]>('tags'),
        send<Worktree[]>('worktree.list'),
        send<{ name: string; email: string }>('user'),
      ]);
      // Resolve the current branch before requesting its log, so the initial
      // graph shows HEAD's branch rather than the hardcoded default (and so
      // we don't try to `git log master` in a repo that has no master).
      const current = brs.find(b => b.isCurrent);
      if (current) activeBranch = current.name;
      else if (status.branch) activeBranch = status.branch;

      const rawCommits = await send<Commit[]>('log', { branch: allBranches ? '' : activeBranch, limit: 0 });

      sbBranch    = status.branch || activeBranch;
      sbInfo      = aheadBehindText(status.ahead ?? 0, status.behind ?? 0);
      sbInfoTitle = status.ahead || status.behind ? `↑${status.ahead} ↓${status.behind}` : '';
      hasPending  = (status.behind ?? 0) > 0;
      detached    = !!status.detached;
      identityMissing = !user?.name || !user?.email;
      branches    = brs;
      commits     = rawCommits;
      stashes     = rawStashes;
      tags        = rawTags ?? [];
      worktrees   = rawWorktrees ?? [];
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
    requestRepoState();
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
  // Push with a safe force fallback: on a non-fast-forward rejection, offer a
  // --force-with-lease push (won't clobber commits you haven't fetched).
  async function doPush(branch?: string) {
    flash('Pushing…');
    const label = branch ?? 'current branch';
    try {
      await send('push', branch ? { branch } : {});
      flash(`Pushed ${label}`, '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const rejected = /non-fast-forward|\brejected\b|fetch first|tip of your current branch is behind|behind its remote/i.test(msg);
      if (!rejected) { flash('Push failed: ' + msg, '#f07070'); return; }
      const ok = await uiConfirm(
        `Push was rejected — your branch has diverged from the remote.\n\n` +
        `Force push with lease? This updates the remote branch but refuses to overwrite commits you haven't fetched.`
      );
      if (!ok) { flash('Push cancelled', '#f07070'); return; }
      try {
        await send('push.force', branch ? { branch } : {});
        flash(`Force-pushed ${label}`, '#e0a030');
        loadAll();
      } catch (e2: unknown) {
        flash('Force push failed: ' + (e2 instanceof Error ? e2.message : String(e2)), '#f07070');
      }
    }
  }

  // Undo last operation (ideas.md express lane): abort an in-progress
  // merge/rebase/cherry-pick/revert, else rewind to ORIG_HEAD (the state before
  // the last merge/rebase/reset/pull), auto-stashing a dirty tree first.
  async function undoLast() {
    const confirmed = await uiConfirm(
      `Undo the last git operation?\n\n` +
      `Aborts an in-progress merge/rebase, or rewinds to the state before the ` +
      `last merge/rebase/reset/pull. Uncommitted changes are stashed first, not lost.`
    );
    if (!confirmed) return;
    flash('Undoing…');
    try {
      const res = await send<{ action: string; stashed: boolean }>('undo.last');
      flash(
        `Undone: ${res?.action ?? 'done'}${res?.stashed ? ' · changes stashed' : ''}`,
        '#4ec94e'
      );
      loadAll();
    } catch (e: unknown) {
      flash('Undo failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // Detached-HEAD rescue (ideas.md): create a branch at the current commit so
  // work isn't stranded on a detached HEAD.
  async function createBranchHere() {
    const name = await uiPrompt('Create a branch here to keep your work — branch name:');
    if (!name) return;
    flash(`Creating ${name}…`);
    try {
      await send('branch.create', { name }); // checkout -b at current HEAD
      flash(`On new branch ${name}`, '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      flash('Create failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // Git identity setup (ideas.md): friendly inline fix for the cryptic
  // "Please tell me who you are" — sets user.name/user.email globally.
  async function setupIdentity() {
    const name = await uiPrompt('Your name (for commit authorship):');
    if (!name) return;
    const email = await uiPrompt('Your email (for commit authorship):');
    if (!email) return;
    flash('Saving git identity…');
    try {
      await send('user.set', { name, email, global: true });
      flash('Git identity set', '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      flash('Could not set identity: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  async function tbAction(a: string) {
    if (a === 'refresh') { loadAll(); return; }
    if (a === 'undo') { await undoLast(); return; }
    if (a === 'push') { await doPush(); return; }
    flash({ fetch: 'Fetching…', pull: 'Pulling…', push: 'Pushing…' }[a] ?? a);
    try {
      await send(a);
      flash(a + ' done', '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      flash(a + ' failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  // Smart Sync — fetch, then bring the CURRENT branch in line with its upstream.
  // A plain fast-forward pull on a clean tree runs silently (fully undoable via
  // the Undo button → reset --hard ORIG_HEAD). Anything that rebases, stashes, or
  // pushes (a push can't be undone) happens only behind one descriptive confirm.
  // See syncPlan.ts for the decision tree.
  async function smartSync() {
    flash('Fetching…');
    let st: GitStatus | null = null;
    try {
      await send('fetch');
      st = await send<GitStatus>('status');
    } catch (e: unknown) {
      flash('Sync failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
      return;
    }
    if (!st) return;

    const ahead = st.ahead ?? 0;
    const behind = st.behind ?? 0;
    const plan = planSync(ahead, behind, (st.modified ?? 0) > 0);
    const branch = st.branch || activeBranch;

    if (plan.kind === 'noop') {
      flash('Already up to date', '#4ec94e');
      loadAll();
      return;
    }

    if (plan.kind === 'confirm') {
      const ok = await uiConfirm(
        `Sync ${branch} will:\n\n` +
        plan.steps.map((s) => `• ${s}`).join('\n') +
        `\n\nA push can't be taken back with the Undo button. Prefer to do it ` +
        `yourself? Cancel and use the Pull / Push buttons.`
      );
      if (!ok) { flash('Sync cancelled', '#e0a030'); return; }
    }

    flash('Syncing…');
    let pushRejected = false;
    try {
      if (plan.stash) await send('stash.save', { message: 'hydragit: auto-stash before sync' });

      if (plan.pull !== 'none') {
        try {
          if (plan.pull === 'rebase') await send('pull.mode', { mode: 'rebase' });
          else await send('pull');
        } catch (e: unknown) {
          // A rebase that hits a conflict exits non-zero and parks the repo
          // mid-rebase. That's not a dead failure — the rebase bar takes over.
          // The common collab case (your PR branch, main merged in while you
          // worked) rebases cleanly; conflicts are rare, and here we just hand
          // off: tell the user to resolve + continue, then push. A flash would
          // vanish before they're done, so also fire a persistent notification.
          const paused = await send<{ inProgress: boolean }>('rebase.status')
            .then((r) => !!r?.inProgress)
            .catch(() => false);
          if (paused) {
            const tail = plan.push
              ? ` then run Sync again to push your ${ahead} commit${ahead === 1 ? '' : 's'}.`
              : '.';
            const note = `Sync paused on a rebase conflict. Resolve it and Continue the rebase (using the bar),${tail}`;
            flash('Rebase paused on conflicts — resolve, Continue, then Sync again to push.', '#e0a030');
            uiNotify(note + (plan.stash ? ' Your stashed changes are in the Stashes list.' : ''));
            loadAll();
            return;
          }
          throw e; // a genuine (non-conflict) pull failure
        }
      }

      if (plan.push) {
        // After a rebase the push is a fast-forward, so a PLAIN push is correct —
        // never force here. If the remote advanced again between our fetch and this
        // push, git rejects it; the safe answer is to Sync again (fetch + rebase),
        // NOT to force, which would clobber the new remote commits.
        try {
          await send('push');
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/non-fast-forward|\brejected\b|fetch first|behind/i.test(msg)) {
            pushRejected = true;
          } else {
            throw e;
          }
        }
      }

      if (plan.stash) await send('stash.pop'); // restore WIP even if the push was rejected

      if (pushRejected) {
        flash('Pulled & rebased, but the remote moved again — run Sync once more (no force needed).', '#e0a030');
      } else {
        const receipt: string[] = [];
        if (plan.pull !== 'none') receipt.push(`pulled ${behind}`);
        if (plan.push) receipt.push(`pushed ${ahead}`);
        flash('Synced' + (receipt.length ? ' · ' + receipt.join(' · ') : ''), '#4ec94e');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      flash('Sync failed: ' + msg + (plan.stash ? ' · your changes are safe in a stash' : ''), '#f07070');
    }
    loadAll();
  }

  async function railAction(a: string) {
    if (a === 'sync') {
      await smartSync();
      return;
    }
    if (a === 'branch.switch') {
      // Filterable list of every branch except the one we're already on.
      const names = branches.map((b) => b.name).filter((n) => n !== activeBranch);
      const name = await uiPick(names, 'Checkout branch…');
      if (!name) return;
      await switchToBranch(name);
      return;
    }
    if (a === 'worktree.new') {
      await createWorktree();
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
      // If the name resolves to a remote branch, delete it on the remote instead
      // of silently doing a local-only delete (BUGS.md #2).
      const match = branches.find((b) => b.name === name);
      if (match?.isRemote) { await deleteRemoteBranch(name); return; }
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
      squash: async () => {
        if (!(await uiConfirm(
          `Squash ${hash.slice(0, 7)} into its parent?\n\n` +
          `The two commits become one (their messages are combined). This rewrites history.`
        ))) return;
        flash(`Squashing ${hash.slice(0, 7)}…`);
        try {
          const res = await send<{ conflict: boolean }>('commit.squash', { commit: hash });
          if (res?.conflict) {
            rebaseInProgress = true;
            flash('Rebase paused on a conflict — resolve, then Continue', '#e0a030');
          } else {
            flash(`Squashed ${hash.slice(0, 7)} into its parent`, '#4ec94e');
          }
        } catch (e: unknown) {
          flash('Squash failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
        }
        loadAll();
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

  // Rename a whole branch folder — renames every local branch under the prefix
  // (feature/* → feat/*), preserving suffixes. Local-only.
  async function handleFolderCtx(e: MouseEvent, prefix: string) {
    e.preventDefault();
    e.stopPropagation();
    const newPrefix = await uiPrompt(
      `Rename all branches under "${prefix}/" — new folder name:`,
      prefix
    );
    if (!newPrefix || newPrefix === prefix) return;
    // Which branches under this folder track a remote — captured BEFORE the
    // rename, while `branches` still holds the old names + their upstreams.
    const tracked = branches.filter(
      (b) => !b.isRemote && (b.name === prefix || b.name.startsWith(prefix + '/')) && !!b.upstream
    );
    try {
      const renamed = await send<string[]>('branch.rename.folder', {
        oldPrefix: prefix,
        newPrefix,
      });
      const n = renamed?.length ?? 0;
      flash(`Renamed ${n} branch${n === 1 ? '' : 'es'} to ${newPrefix}/`, '#4ec94e');

      // Folder rename is local-only by default; offer to propagate to the remote
      // for the branches that track one (#6). Reversible — rename the folder back.
      if (tracked.length) {
        const ok = await uiConfirm(
          `Also rename on the remote?\n\n` +
          `${tracked.length} branch${tracked.length === 1 ? '' : 'es'} under "${prefix}/" ` +
          `track a remote. This pushes the new names and deletes the old remote ` +
          `branches. Reversible: rename the folder back to restore.`
        );
        if (ok) {
          flash('Renaming on remote…');
          try {
            const pushed = await send<string[]>('branch.rename.folder.remote', { newPrefix });
            const m = pushed?.length ?? 0;
            flash(`Renamed ${m} branch${m === 1 ? '' : 'es'} on the remote too`, '#4ec94e');
          } catch (err: unknown) {
            flash('Remote folder rename failed: ' + (err instanceof Error ? err.message : String(err)), '#f07070');
          }
        }
      }
      loadAll();
    } catch (err: unknown) {
      flash('Folder rename failed: ' + (err instanceof Error ? err.message : String(err)), '#f07070');
    }
  }

  // Delete a REMOTE branch row (name like "origin/feature"). Runs
  // `git push <remote> --delete <branch>` via the host, which removes it on the
  // server AND prunes the local tracking ref — fixing BUGS.md #1/#2 where the
  // old path sent the tracking name to `git branch -d` (local-only) and failed.
  async function deleteRemoteBranch(fullName: string) {
    const slash = fullName.indexOf('/');
    const remote = slash === -1 ? 'origin' : fullName.slice(0, slash);
    const branch = slash === -1 ? fullName : fullName.slice(slash + 1);
    const confirmed = await uiConfirm(
      `Delete remote branch "${fullName}"?\n\n` +
      `This runs 'git push ${remote} --delete ${branch}' and removes it on ${remote} ` +
      `for everyone. This cannot be undone.`
    );
    if (!confirmed) return;
    flash(`Deleting ${fullName} on ${remote}…`);
    try {
      await send('branch.delete.remote', { remote, branch });
      flash(`Deleted ${fullName}`, '#f07070');
    } catch (e: unknown) {
      flash('Remote delete failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
    loadAll();
  }

  // Switch to a branch, handling the common "local changes would be overwritten"
  // failure by offering to stash first (or cancel). A remote row
  // ("origin/feature") checks out as a local tracking branch of the same short
  // name. Shared by the rail switch and the branch context-menu entry.
  async function switchToBranch(name: string) {
    const target = branches.find((b) => b.name === name)?.isRemote
      ? name.slice(name.indexOf('/') + 1)
      : name;
    flash(`Checking out ${target}…`);
    try {
      await send('checkout', { branch: target });
      flash(`Checked out ${target}`, '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // git refuses to switch when uncommitted changes would be clobbered.
      const blocked = /overwritten by checkout|stash them before you switch/i.test(msg);
      if (!blocked) {
        flash('Checkout failed: ' + msg, '#f07070');
        return;
      }
      const stash = await uiConfirm(
        `Local changes would be overwritten by checking out "${target}".\n\n` +
        `Stash them and check out? (Cancel to stay put — your changes are kept.)`
      );
      if (!stash) { flash('Checkout cancelled', '#e0a030'); return; }
      try {
        await send('stash.save', { message: `hydragit: auto-stash before checkout of ${target}` });
        await send('checkout', { branch: target });
        flash(`Stashed changes and checked out ${target}`, '#4ec94e');
        loadAll();
      } catch (e2: unknown) {
        flash('Checkout failed: ' + (e2 instanceof Error ? e2.message : String(e2)), '#f07070');
        loadAll();
      }
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
      checkout:  async () => { await switchToBranch(ctxBranch); },
      merge:     async () => { await send('merge',    { branch: ctxBranch });                flash(`Merged ${ctxBranch}`, '#4ec94e');     loadAll(); },
      rebase:    async () => { await send('rebase',   { onto:   ctxBranch });                flash('Rebased', '#4ec94e');                 loadAll(); },
      push:      async () => { await doPush(ctxBranch); },
      delete:    async () => {
        const b = branches.find((x) => x.name === ctxBranch);
        if (b?.isRemote) { await deleteRemoteBranch(ctxBranch); return; }
        try {
          await send('branch.delete', { name: ctxBranch, force: false });
          flash(`Deleted ${ctxBranch}`, '#f07070');
        } catch (e: unknown) {
          flash('Delete failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
        }
        loadAll(); // refresh regardless of outcome so a failed delete never leaves a stale row
      },
      copy:      async () => { flash(`Copied: ${ctxBranch}`, '#4ec94e'); },
      rename:    async () => {
        const from = ctxBranch;
        const to = await uiPrompt('New branch name:', from);
        if (!to || to === from) return;
        // Capture the upstream BEFORE the rename (branches still holds the old name).
        const upstream = branches.find((x) => x.name === from)?.upstream ?? '';
        try {
          await send('branch.rename', { from, to });
          flash(`Renamed to ${to}`, '#4ec94e');
          // If it tracked a remote, offer to propagate the rename there too.
          if (upstream) {
            const remote = upstream.split('/')[0];
            const ok = await uiConfirm(
              `Also rename on the remote (${remote})?\n\n` +
              `This pushes '${to}' with tracking and deletes the old remote branch '${from}'.`
            );
            if (ok) {
              flash(`Renaming on ${remote}…`);
              await send('branch.rename.remote', { remote, old: from, new: to });
              flash(`Renamed on ${remote} too`, '#4ec94e');
            }
          }
          loadAll();
        } catch (e: unknown) {
          flash('Rename failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
          loadAll();
        }
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

  // ── Worktrees ─────────────────────────────────────────────────────────────
  // Default location follows the GitLens convention: a sibling
  // "<repo>.worktrees/" folder, keyed by branch (slashes flattened). Derived
  // from the main worktree's absolute path so it works regardless of cwd.
  function defaultWorktreePath(branch: string): string {
    const safe = branch.replace(/[\\/]/g, '-');
    const main = worktrees.find((w) => w.isMain)?.path ?? '';
    if (!main) return `../worktrees/${safe}`;
    const parts = main.split(/[\\/]/);
    const repo = parts.pop() || 'repo';
    const parent = parts.join('/');
    return `${parent}/${repo}.worktrees/${safe}`;
  }

  function openWorktree(path: string) {
    // Host-only relay: opens the folder in a new VS Code window.
    send('worktree.open', { path });
    flash('Opening worktree in a new window…', '#4ec94e');
  }

  // Create a worktree: pick an existing branch (one not already checked out in
  // another worktree) or start a new branch, then choose the folder.
  async function createWorktree() {
    const NEW = '✚ Create new branch…';

    // A branch can only live in one worktree at a time — hide any already
    // checked out (this also covers the current branch via the main worktree).
    const inWorktree = new Set(worktrees.map((w) => w.branch).filter(Boolean));
    const locals = branches.filter((b) => !b.isRemote);
    const localNames = new Set(locals.map((b) => b.name));

    // Local branches: the bread-and-butter picks.
    const localItems = locals
      .filter((b) => !inWorktree.has(b.name))
      .map((b) => ({ label: b.name, description: b.trackShort ? `local · ${b.trackShort}` : 'local' }));

    // Remote branches without a local of the same short name — picking one
    // creates a local tracking branch in the new worktree (GitLens-style).
    const remoteItems = branches
      .filter((b) => b.isRemote)
      .map((b) => ({ full: b.name, short: b.name.slice(b.name.indexOf('/') + 1) }))
      .filter((r) => r.short !== 'HEAD' && !localNames.has(r.short) && !inWorktree.has(r.short))
      .map((r) => ({ label: r.full, description: `remote → new branch '${r.short}'` }));

    const items = [
      { label: NEW, description: `from ${activeBranch}` },
      ...localItems,
      ...remoteItems,
    ];
    const choice = await uiPick(items, 'Branch for the new worktree — local, remote, or create new');
    if (!choice) return;

    let branch = choice; // resulting (local) branch name, used for the default path
    let newBranch = '';
    let start = '';
    if (choice === NEW) {
      const name = await uiPrompt('New branch name for the worktree:');
      if (!name) return;
      newBranch = name;
      branch = name;
    } else {
      const picked = branches.find((b) => b.name === choice);
      if (picked?.isRemote) {
        // Create a local branch tracking the remote ref inside the worktree.
        const short = choice.slice(choice.indexOf('/') + 1);
        newBranch = short;
        start = choice;
        branch = short;
      }
    }

    const path = await uiPrompt('Worktree folder path:', defaultWorktreePath(branch));
    if (!path) return;
    flash(`Creating worktree at ${path}…`);
    try {
      await send('worktree.add', newBranch ? { path, newBranch, start } : { path, branch });
      flash(`Worktree created for ${branch}`, '#4ec94e');
      loadAll();
    } catch (e: unknown) {
      flash('Create worktree failed: ' + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
  }

  function showWorktreeCtx(e: MouseEvent, wt: Worktree) {
    e.preventDefault();
    e.stopPropagation();
    ctxWorktree = wt;
    worktreeMenu = {
      visible: true,
      wt,
      x: Math.min(e.clientX, window.innerWidth - 280),
      y: Math.min(e.clientY, window.innerHeight - 220),
    };
  }

  async function worktreeCtxAction(a: string) {
    const wt = ctxWorktree;
    worktreeMenu = { ...worktreeMenu, visible: false };
    if (!wt) return;
    try {
      switch (a) {
        case 'open':
          openWorktree(wt.path);
          break;
        case 'lock':
          await send('worktree.lock', { path: wt.path });
          flash('Worktree locked', '#4ec94e');
          loadAll();
          break;
        case 'unlock':
          await send('worktree.unlock', { path: wt.path });
          flash('Worktree unlocked', '#4ec94e');
          loadAll();
          break;
        case 'move': {
          const to = await uiPrompt('Move worktree to path:', wt.path);
          if (!to || to === wt.path) return;
          await send('worktree.move', { from: wt.path, to });
          flash('Worktree moved', '#4ec94e');
          loadAll();
          break;
        }
        case 'prune':
          await send('worktree.prune');
          flash('Pruned stale worktrees', '#4ec94e');
          loadAll();
          break;
        case 'remove': {
          const ok = await uiConfirm(
            `Remove worktree at ${wt.path}?\n\n` +
              `The folder and its checkout are removed. Committed work on the branch is kept.`
          );
          if (!ok) return;
          try {
            await send('worktree.remove', { path: wt.path, force: false });
            flash('Worktree removed', '#4ec94e');
            loadAll();
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            const force = await uiConfirm(
              `Could not remove worktree:\n${msg}\n\n` +
                `Force remove? Uncommitted changes in the worktree will be lost.`
            );
            if (force) {
              await send('worktree.remove', { path: wt.path, force: true });
              flash('Worktree force-removed', '#e0a030');
              loadAll();
            }
          }
          break;
        }
      }
    } catch (e: unknown) {
      flash(`${a} failed: ` + (e instanceof Error ? e.message : String(e)), '#f07070');
    }
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

  // Left-click on a worktree row: open it in a new window (the chosen primary
  // action), except the main worktree — that's already this window.
  function selectWorktree(path: string) {
    const wt = worktrees.find((w) => w.path === path);
    if (wt?.isMain) {
      flash('This is the current worktree', '#e0a030');
      return;
    }
    openWorktree(path);
  }

  function closeMenus() {
    branchMenu   = { ...branchMenu,   visible: false };
    stashMenu    = { ...stashMenu,    visible: false };
    tagMenu      = { ...tagMenu,      visible: false };
    worktreeMenu = { ...worktreeMenu, visible: false };
  }
</script>

<svelte:window
  onclick={closeMenus}
  onkeydown={(e) => {
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

  {#if identityMissing}
    <div class="info-bar">
      <span class="info-bar-msg">Git doesn't know who you are yet — set a name &amp; email so your commits are attributed.</span>
      <div class="rebase-bar-actions">
        <button class="rebase-btn" onclick={setupIdentity}>Set up identity</button>
      </div>
    </div>
  {/if}

  {#if detached}
    <div class="info-bar">
      <span class="info-bar-msg">You're not on a branch (detached HEAD). Create one here to keep your work.</span>
      <div class="rebase-bar-actions">
        <button class="rebase-btn" onclick={createBranchHere}>Create branch here</button>
      </div>
    </div>
  {/if}

  {#if rebaseInProgress}
    <div class="rebase-bar">
      <span class="rebase-bar-msg">⚠ Rebase in progress — resolve conflicts, then continue.</span>
      <div class="rebase-bar-actions">
        <button class="rebase-btn" onclick={() => rebaseControl('continue')}>Continue</button>
        <button class="rebase-btn" onclick={() => rebaseControl('skip')}>Skip</button>
        <button class="rebase-btn rebase-btn--danger" onclick={() => rebaseControl('abort')}>Abort</button>
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
        {worktrees}
        {activeBranch}
        {selStashIdx}
        onSelectBranch={selectBranch}
        onHead={enterHeadMode}
        onFolderCtx={handleFolderCtx}
        onSelectStash={selectStash}
        onStashAction={stashAction}
        onNewBranch={() => railAction('branch.new')}
        onBranchCtx={showBranchCtx}
        onStashCtx={showStashCtx}
        onTagCtx={showTagCtx}
        onTagSelect={selectTagCommit}
        onSelectWorktree={selectWorktree}
        onWorktreeCtx={showWorktreeCtx}
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
    repo={repoName}
    onRepoClick={openRepoPicker}
    branch={sbBranch}
    info={sbInfo}
    infoTitle={sbInfoTitle}
    countsText={flashMsg ? `⚡ ${flashMsg}` : sbCounts}
    {iconUri}
  />

  <ContextMenu
    {branchMenu}
    {stashMenu}
    {tagMenu}
    {worktreeMenu}
    onBranchAction={branchAction}
    onStashAction={stashCtxAction}
    onTagAction={tagCtxAction}
    onWorktreeAction={worktreeCtxAction}
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

  /* Calm informational banners (detached HEAD, missing identity) — blue, not the
     amber "something's wrong" tone of the rebase bar. */
  .info-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 5px 12px;
    background: rgba(77, 170, 252, 0.12);
    border-bottom: 0.5px solid rgba(77, 170, 252, 0.4);
    color: #6cb6ff;
    font-size: var(--hg-font-sm);
    flex-shrink: 0;
  }
  .info-bar-msg { overflow: hidden; text-overflow: ellipsis; }
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
