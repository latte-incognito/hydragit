import vscode from './vscode';

type Pending = { resolve: (data: unknown) => void; reject: (err: Error) => void };
type Handler = (data: unknown) => void;

const _pending = new Map<string, Pending>();
const _handlers = new Map<string, Handler[]>();

// One listener for the entire app lifetime
window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as {
    id?: string;
    type?: string;
    ok?: boolean;
    data?: unknown;
    error?: string;
  };

  // Named push events (e.g. statusUpdate)
  if (msg.type) {
    const handlers = _handlers.get(msg.type) ?? [];
    handlers.forEach((h) => h(msg.data));
    return;
  }

  // Promise resolution for send()
  if (msg.id) {
    const p = _pending.get(msg.id);
    if (!p) return;
    _pending.delete(msg.id);
    msg.ok ? p.resolve(msg.data) : p.reject(new Error(msg.error ?? 'Unknown error'));
  }
});

/** Send a command to the extension and await the response. */
export function send<T = unknown>(cmd: string, params: Record<string, unknown> = {}): Promise<T> {
  const id = Math.random().toString(36).slice(2, 9);
  return new Promise<T>((resolve, reject) => {
    _pending.set(id, { resolve: resolve as (d: unknown) => void, reject });
    vscode.postMessage({ id, cmd, params });
  });
}

/** Subscribe to a push event type from the extension. Returns an unsubscribe fn. */
export function on(type: string, handler: Handler): () => void {
  if (!_handlers.has(type)) _handlers.set(type, []);
  _handlers.get(type)!.push(handler);
  return () => {
    const arr = _handlers.get(type) ?? [];
    _handlers.set(
      type,
      arr.filter((h) => h !== handler)
    );
  };
}
