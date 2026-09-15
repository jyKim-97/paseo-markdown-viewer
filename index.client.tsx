import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MarkdownPanel } from "./client/markdown-panel";
import { OpenMarkdownRow } from "./client/open-markdown-row";
import { bindPanelOpener } from "./client/panel-bridge";
import { openTab } from "./client/panel-tabs";
import { pluginPing } from "./shared/markdown-file";
import { OPEN_MARKDOWN_KIND, OPEN_MARKDOWN_VERSION, openMarkdownRowData } from "./shared/open-request";

const PANEL_ID = "markdown";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: PANEL_ID,
    title: "Markdown",
    icon: "BookOpenText",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: MarkdownPanel,
  });

  client.addCommandCenterItem({
    id: "open-markdown",
    title: "Open markdown viewer",
    icon: "BookOpenText",
    keywords: ["markdown", "preview", "readme", "docs"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel(PANEL_ID);
    },
  });

  // `/md docs/plan.md` opens the file in a tab and brings the panel forward. No prompt is sent.
  client.addSlashCommand({
    name: "md",
    description: "Open a markdown file in the side panel",
    argumentHint: "[path relative to workspace, or absolute]",
    context: "workspace",
    onSubmit({ args, workspace, openPanel }) {
      if (args) openTab(workspace.id, args);
      openPanel(PANEL_ID);
    },
  });

  // Agents reach the panel through timeline rows: explicit requests via the daemon inbox, and
  // follow mode when the daemon sees an agent edit a markdown file.
  client.addTimelineRenderer({
    kind: OPEN_MARKDOWN_KIND,
    version: OPEN_MARKDOWN_VERSION,
    schema: openMarkdownRowData,
    Component: OpenMarkdownRow,
  });
  const unbind = bindPanelOpener((workspaceId) => client.openPanel(PANEL_ID, { workspaceId }));

  // Wake the daemon side so follow mode and the inbox have the Paseo API before anything else happens.
  void client.rpc(pluginPing, {}).catch(() => undefined);

  return () => {
    unbind();
  };
}
