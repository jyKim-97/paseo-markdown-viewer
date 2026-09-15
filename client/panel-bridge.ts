import { openTab } from "./panel-tabs";

// Timeline renderers cannot open panels themselves; the client entry lends them the ability here.

type PanelOpener = (workspaceId: string) => void;

let opener: PanelOpener | null = null;

export function bindPanelOpener(open: PanelOpener): () => void {
  opener = open;
  return () => {
    opener = null;
  };
}

// Open a tab for the file. `activate` switches to it (explicit requests); otherwise it waits in
// the background with an unread mark (follow mode). `bringForward` also raises the panel itself.
export function openMarkdownInPanel(
  workspaceId: string,
  path: string,
  { activate, bringForward }: { activate: boolean; bringForward: boolean },
) {
  openTab(workspaceId, path, { activate });
  if (bringForward) opener?.(workspaceId);
}
