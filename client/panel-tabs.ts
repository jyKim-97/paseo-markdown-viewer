import { useSyncExternalStore } from "react";

// The open tabs of each workspace's panel, which one is active, and which hidden tabs have
// changed since the user last looked at them. Lives outside React so the `/md` slash command,
// the Command Center, and timeline rows can open tabs before the panel mounts.

export type PanelTabs = {
  readonly paths: readonly string[];
  readonly active: string | null;
  readonly unread: readonly string[];
};

const EMPTY: PanelTabs = { paths: [], active: null, unread: [] };

let byWorkspace: ReadonlyMap<string, PanelTabs> = new Map();
const listeners = new Set<() => void>();

export function getTabs(workspaceId: string): PanelTabs {
  return byWorkspace.get(workspaceId) ?? EMPTY;
}

export function useTabs(workspaceId: string): PanelTabs {
  return useSyncExternalStore(subscribe, () => getTabs(workspaceId));
}

// Open a tab for `path`. Activating it clears its unread mark; leaving it in the background
// (follow mode) marks it unread instead, unless nothing else is open yet.
export function openTab(workspaceId: string, path: string, { activate = true } = {}) {
  const trimmed = path.trim();
  if (!trimmed) return;
  update(workspaceId, (tabs) => {
    const paths = tabs.paths.includes(trimmed) ? tabs.paths : [...tabs.paths, trimmed];
    const becomesActive = activate || tabs.active === null;
    return becomesActive
      ? { paths, active: trimmed, unread: without(tabs.unread, trimmed) }
      : { paths, active: tabs.active, unread: withUnique(tabs.unread, trimmed) };
  });
}

export function activateTab(workspaceId: string, path: string) {
  update(workspaceId, (tabs) =>
    tabs.paths.includes(path) ? { ...tabs, active: path, unread: without(tabs.unread, path) } : tabs,
  );
}

// A hidden tab's file changed on disk.
export function markUnread(workspaceId: string, path: string) {
  update(workspaceId, (tabs) =>
    tabs.paths.includes(path) && tabs.active !== path ? { ...tabs, unread: withUnique(tabs.unread, path) } : tabs,
  );
}

// Closing the active tab activates its right-hand neighbour, or the last remaining tab.
export function closeTab(workspaceId: string, path: string) {
  update(workspaceId, ({ paths, active, unread }) => {
    const index = paths.indexOf(path);
    const remaining = paths.filter((candidate) => candidate !== path);
    const nextActive = active !== path ? active : remaining[Math.min(index, remaining.length - 1)] ?? null;
    return { paths: remaining, active: nextActive, unread: without(unread, path, nextActive) };
  });
}

const without = (list: readonly string[], ...items: (string | null)[]) =>
  list.filter((entry) => !items.includes(entry));

const withUnique = (list: readonly string[], item: string) => (list.includes(item) ? list : [...list, item]);

function update(workspaceId: string, change: (tabs: PanelTabs) => PanelTabs) {
  byWorkspace = new Map([...byWorkspace, [workspaceId, change(getTabs(workspaceId))]]);
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
