// Interactive-rebase plan logic — pure + total so the editor's rules can be
// unit-tested exhaustively (the Svelte component just renders rows and runs
// these on its working copy). Mirrors the established syncPlan.ts / stashRedirect.ts
// pattern: keep the decision out of the component so jsdom can't get in the way.

export type RebaseAction = 'pick' | 'squash' | 'fixup' | 'drop';

export interface RebaseRow {
  sha: string;
  action: string;
}

export interface RebasePlanItem {
  sha: string;
  action: string;
}

export const REBASE_ACTIONS: readonly RebaseAction[] = ['pick', 'squash', 'fixup', 'drop'];

// The first *kept* (non-drop) commit must be a pick — squash/fixup need a commit
// above them to fold into. This mirrors the Go guard in RunInteractiveRebase
// ("the first kept commit must be 'pick'"). A plan with nothing kept (no commits,
// or everything dropped) is also invalid: there's no rebase to run.
export function isRebasePlanInvalid(rows: RebaseRow[]): boolean {
  const firstKept = rows.find((r) => r.action !== 'drop');
  return firstKept ? firstKept.action !== 'pick' : true;
}

// The plan emitted to the backend: { sha, action } in row order (oldest-first,
// matching git's todo order).
export function buildRebasePlan(rows: RebaseRow[]): RebasePlanItem[] {
  return rows.map((r) => ({ sha: r.sha, action: r.action }));
}
