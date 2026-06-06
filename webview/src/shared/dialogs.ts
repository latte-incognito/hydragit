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

/**
 * Native quick-pick (type-to-filter autocomplete). Resolves to the chosen
 * item, or null if cancelled. Used for "switch to branch" so the user gets a
 * filterable branch list instead of typing a name blind.
 */
export function uiPick(items: string[], placeholder = ''): Promise<string | null> {
  return send<string | null>('ui.pick', { items, placeholder });
}
