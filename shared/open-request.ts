import { z } from "zod";

// A request to show a file in the panel. Two sources: an explicit request (an agent running
// bin/open-markdown) and follow mode (the daemon noticed an agent write or edit the file).
// The daemon turns either into a timeline row on the agent; the row's renderer opens the tab.

export const OPEN_MARKDOWN_KIND = "open-markdown";
export const OPEN_MARKDOWN_VERSION = 1;

export const openMarkdownRowData = z.object({
  path: z.string().min(1),
  requestedAt: z.string(),
  source: z.enum(["request", "follow"]).default("request"),
});

export type OpenMarkdownRowData = z.output<typeof openMarkdownRowData>;
