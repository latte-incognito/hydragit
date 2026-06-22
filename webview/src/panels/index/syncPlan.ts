// Smart Sync planning — a pure, total function so the decision tree can be
// unit-tested exhaustively (the webview just executes the result).
//
// Contract (Option A): a plain fast-forward pull on a clean tree is fully
// undoable (`reset --hard ORIG_HEAD`), so it runs **silently**. Anything beyond
// that — a rebase to reconcile divergence, an auto-stash for a dirty tree, or a
// push (which Undo can't retract) — is a **confirm** plan, shown to the user
// with a plain-language description before anything happens.

export interface SyncPlan {
  /** noop = already even · silent = run without asking · confirm = ask first */
  kind: 'noop' | 'silent' | 'confirm';
  stash: boolean;                  // stash before, restore after
  pull: 'none' | 'ff' | 'rebase';  // how to integrate incoming commits
  push: boolean;                   // push local (ahead) commits
  force: boolean;                  // force-with-lease push instead of pull+push
  steps: string[];                 // plain-language plan, for the confirm dialog
}

function count(x: number, noun: string): string {
  return `${x} ${noun}${x === 1 ? '' : 's'}`;
}

// `rewrite` (from git.DivergenceIsRewrite): the divergence is a local history
// rewrite of already-pushed commits (amend/rebase/reword/squash). Reconcile
// with force-with-lease, NOT a rebase — rebasing would pull the pre-rewrite
// commits back (the "magic sync rebases my amend back" bug, ROADMAP §4.2).
export function planSync(ahead: number, behind: number, dirty: boolean, rewrite = false): SyncPlan {
  if (ahead === 0 && behind === 0) {
    return { kind: 'noop', stash: false, pull: 'none', push: false, force: false, steps: [] };
  }

  const diverged = ahead > 0 && behind > 0;

  if (diverged && rewrite) {
    // The "behind" commits are old versions of our own work; discard them by
    // force-pushing the rewritten history (with lease, so a teammate's push
    // since our last fetch still aborts it). No pull, no stash needed.
    return {
      kind: 'confirm', stash: false, pull: 'none', push: true, force: true,
      steps: [
        `force-push your ${count(ahead, 'rewritten commit')} with lease, replacing the old version on the remote`,
        `(refuses if someone else has pushed since your last fetch)`,
      ],
    };
  }

  const stash = dirty && behind > 0;            // only need a stash if we integrate
  const pull: SyncPlan['pull'] = behind > 0 ? (diverged ? 'rebase' : 'ff') : 'none';
  const push = ahead > 0;

  // A plain ff-pull on a clean tree is the only thing safe to do unattended.
  const needsConfirm = diverged || dirty || push;
  if (!needsConfirm) {
    return { kind: 'silent', stash: false, pull: 'ff', push: false, force: false, steps: [] };
  }

  const steps: string[] = [];
  if (stash) steps.push('stash your uncommitted changes');
  if (pull === 'rebase') {
    steps.push(`rebase your ${count(ahead, 'commit')} onto the ${count(behind, 'incoming change')}`);
  } else if (pull === 'ff') {
    steps.push(`pull the ${count(behind, 'incoming change')}`);
  }
  if (push) steps.push(`push your ${count(ahead, 'commit')}`);
  if (stash) steps.push('restore your changes');

  return { kind: 'confirm', stash, pull, push, force: false, steps };
}
