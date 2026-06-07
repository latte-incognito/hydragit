import { writable } from 'svelte/store';
import { on, send } from './messageBus';

export interface RepoInfo {
  name: string;
  rootPath: string;
}

export interface RepoState {
  repos: RepoInfo[];
  active: string | undefined;
}

/**
 * Active-repo state, mirrored from the extension. Two webviews (sidebar + main)
 * each hold their own copy of this store, both fed by the same `repoState`
 * pushes from the host — so a switch anywhere updates the selector, the
 * breadcrumb, and the status bar in lockstep.
 */
export const repoState = writable<RepoState>({ repos: [], active: undefined });

function apply(data: unknown): void {
  const d = (data ?? {}) as Partial<RepoState>;
  repoState.set({ repos: d.repos ?? [], active: d.active });
}

// Always-on subscription to host pushes (fires on every switch / list change).
on('repoState', apply);

/**
 * Pull the current state once on mount — the host's initial push can land
 * before this webview resolves, so we ask for it explicitly. Safe to call when
 * there's no multi-repo wiring (no workspace): the rejection is swallowed.
 */
export function requestRepoState(): Promise<void> {
  return send<RepoState>('repo.list')
    .then((s) => {
      if (s) apply(s);
    })
    .catch(() => {
      /* command unavailable (e.g. no workspace) — leave the empty default */
    });
}

/** Ask the extension to switch the active repo. Fire-and-forget. */
export function selectRepo(rootPath: string): void {
  void send('repo.select', { rootPath });
}

/** Open the host's native repo quickpick (used by the main-panel breadcrumb). */
export function openRepoPicker(): void {
  void send('repo.pick');
}
