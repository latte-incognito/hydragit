import { send } from './messageBus';

// Dialog seam. The webview can't reliably use window.prompt/confirm (they're
// suppressed or awkward inside a VS Code webview iframe), so these route through
// the extension host, which shows native VS Code UI (showInputBox /
// showWarningMessage) and returns the result over the same id-based message bus.
//
// This also lets e2e drive these dialogs (they become VS Code quick-inputs /
// modals) and keeps destructive confirmation in the extension host rather than
// trusting the webview (see docs/SECURITY.md).

/** Native input box. Resolves to the entered string, or null if cancelled. */
export function uiPrompt(message: string, value = ''): Promise<string | null> {
  return send<string | null>('ui.prompt', { message, value });
}

/** Native modal confirm. Resolves true only if the user confirmed. */
export function uiConfirm(message: string): Promise<boolean> {
  return send<boolean>('ui.confirm', { message });
}

/** A richer quick-pick row: a label plus optional grey description/detail. */
export interface PickItem {
  label: string;
  description?: string;
  detail?: string;
}

/**
 * Native quick-pick (type-to-filter autocomplete). Items can be plain strings
 * or {label, description} rows; either way it resolves to the chosen item's
 * label, or null if cancelled. Used for "switch to branch" and the worktree
 * branch picker so the user gets a filterable, annotated list.
 */
export function uiPick(items: (string | PickItem)[], placeholder = ''): Promise<string | null> {
  return send<string | null>('ui.pick', { items, placeholder });
}
