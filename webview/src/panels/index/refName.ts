// Helpers for parsing git ref names of the form "<remote>/<branch>".
// Extracted from App.svelte (was repeated inline `slice(indexOf('/')…)` logic)
// so the edge cases are defined once and unit-tested.

// shortBranchName strips a leading remote segment, leaving the branch name:
// "origin/feature" -> "feature", "origin/feat/x" -> "feat/x" (only the remote
// is removed), "feature" -> "feature" (no remote → unchanged).
export function shortBranchName(ref: string): string {
  return ref.slice(ref.indexOf('/') + 1);
}

// splitRemoteRef separates a remote-tracking ref into its remote and branch.
// A bare name (no "/") is treated as living on "origin".
export function splitRemoteRef(ref: string): { remote: string; branch: string } {
  const slash = ref.indexOf('/');
  if (slash === -1) return { remote: 'origin', branch: ref };
  return { remote: ref.slice(0, slash), branch: ref.slice(slash + 1) };
}
