import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { readMarkdownFile } from "../shared/markdown-file";
import { markUnread } from "./panel-tabs";
import { useFileWatch } from "./use-file-watch";

// Keeps a hidden tab's file fresh and marks the tab unread when its content changes. Shares the
// active document's query key, so switching to the tab shows the latest content immediately.
export function TabWatcher({
  workspaceId,
  directory,
  path,
}: {
  workspaceId: string;
  directory: string;
  path: string;
}) {
  const read = useRpc(readMarkdownFile);
  const file = useQuery({
    queryKey: ["paseo-markdown-viewer", workspaceId, directory, path],
    queryFn: () => read({ workspaceDirectory: directory, path }),
    retry: false,
  });
  useFileWatch({ directory, path, version: file.data?.version, refetch: file.refetch });

  // The first version seen is the baseline; every later one is a change the user has not viewed.
  const seen = useRef<string | undefined>(undefined);
  const version = file.data?.version;
  useEffect(() => {
    if (!version) return;
    if (seen.current !== undefined && seen.current !== version) markUnread(workspaceId, path);
    seen.current = version;
  }, [version, workspaceId, path]);

  return null;
}
