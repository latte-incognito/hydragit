// Deciding where a stash click should point the log.
//
// A stash records the branch it was taken on only as a message label
// ("On <branch>: …" / "WIP on <branch>: …") — it is NOT branch-scoped
// (refs/stash is global, so a stash outlives its branch). When a stash is
// opened we *optionally* redirect the log to that origin branch for context,
// but the redirect must never get in the way of showing the stash itself.
//
// Returns the branch to redirect to, or null to stay on the current view.
// null when: the message has no branch label, the branch is already active, or
// the branch no longer exists (deleting it must not break opening the stash —
// `git log <deleted-branch>` would error and blank the detail pane).
export function stashRedirectTarget(
  stashMsg: string,
  activeBranch: string,
  branchNames: string[],
): string | null {
  const m = stashMsg.match(/^(?:WIP )?[Oo]n (.+?):/);
  if (!m) return null;
  const branch = m[1];
  if (branch === activeBranch) return null;
  if (!branchNames.includes(branch)) return null;
  return branch;
}
