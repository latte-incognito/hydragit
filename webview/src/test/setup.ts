import '@testing-library/jest-dom';

// Mock VS Code webview API for all tests
(globalThis as any).acquireVsCodeApi = () => ({
  postMessage: () => {},
  getState: () => undefined,
  setState: () => {},
});