// The three git reset modes the UI offers.
export type ResetMode = 'soft' | 'mixed' | 'hard';

// parseResetMode normalises free-text input (the reset QuickPrompt) into a valid
// ResetMode, or null if it isn't one. Case-insensitive and whitespace-tolerant.
// Extracted from App.svelte so the validation is unit-tested in one place.
export function parseResetMode(raw: string): ResetMode | null {
  const m = raw.trim().toLowerCase();
  return m === 'soft' || m === 'mixed' || m === 'hard' ? m : null;
}
