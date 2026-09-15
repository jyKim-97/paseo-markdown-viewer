import type { PaseoApi } from "@getpaseo/client";

// The daemon hands plugins a PaseoApi only inside hooks and RPC handlers, and the same handle is
// valid for the life of the subprocess. Capture it from the first such call so background work
// (the open-request inbox) can use it; callers that arrive earlier wait.

let captured: PaseoApi | null = null;
const waiting = new Set<(paseo: PaseoApi) => void>();

export function capturePaseo(paseo: PaseoApi) {
  if (captured) return;
  captured = paseo;
  waiting.forEach((resolve) => resolve(paseo));
  waiting.clear();
}

export function whenPaseo(): Promise<PaseoApi> {
  return captured ? Promise.resolve(captured) : new Promise((resolve) => waiting.add(resolve));
}

// Wrap an RPC handler so every call also captures the handle.
export const capturing =
  <Input, Output>(handler: (input: Input, context: { paseo: PaseoApi }) => Output) =>
  (input: Input, context: { paseo: PaseoApi }) => {
    capturePaseo(context.paseo);
    return handler(input, context);
  };
