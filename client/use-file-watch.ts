import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useRef } from "react";
import { awaitMarkdownChange } from "../shared/markdown-file";

const ERROR_RETRY_MS = 3_000;

// Holds one long-poll open against the daemon for the version currently known. When the daemon
// reports a change we re-read; the new version then re-arms the watch. When the daemon times out
// unchanged we re-arm at once. Transient failures back off briefly rather than spin.
export function useFileWatch({
  directory,
  path,
  version,
  refetch,
}: {
  directory: string;
  path: string;
  version: string | undefined;
  refetch: () => Promise<unknown>;
}) {
  const watch = useRpc(awaitMarkdownChange);
  const watchRef = useRef(watch);
  watchRef.current = watch;

  useEffect(() => {
    if (!version) return;
    let active = true;

    const rearm = (afterMs: number): Promise<unknown> =>
      delay(afterMs).then(() => (active ? arm() : undefined));

    const arm = (): Promise<unknown> =>
      watchRef
        .current({ workspaceDirectory: directory, path, version })
        .then(({ changed }) => (changed ? refetch().then(() => rearm(500)) : rearm(0)))
        .catch(() => rearm(ERROR_RETRY_MS));

    void arm();
    return () => {
      active = false;
    };
  }, [directory, path, version, refetch]);
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
