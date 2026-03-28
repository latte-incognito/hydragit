// Singleton — VSCode throws if acquireVsCodeApi() is called more than once.
// Import this everywhere; never call acquireVsCodeApi() directly.

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

const _vscode = acquireVsCodeApi()
export default _vscode
