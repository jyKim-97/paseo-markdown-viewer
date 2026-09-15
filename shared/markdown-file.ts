import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const fileLocator = {
  // Resolved on the daemon relative to the workspace directory; may not escape it.
  workspaceDirectory: z.string().min(1),
  path: z.string().min(1),
};

// Read one markdown file from the daemon machine. `version` identifies the content that was
// returned so the client can ask to be told when it changes.
export const readMarkdownFile = defineRpc({
  name: "markdown.read",
  input: z.object(fileLocator),
  output: z.object({
    absolutePath: z.string(),
    content: z.string(),
    modifiedAt: z.string(),
    version: z.string(),
  }),
});

// Long poll: resolves as soon as the file's content differs from `version`, or after the
// daemon-side wait limit with `changed: false`, in which case the client simply asks again.
export const awaitMarkdownChange = defineRpc({
  name: "markdown.changes",
  input: z.object({ ...fileLocator, version: z.string() }),
  output: z.object({ changed: z.boolean() }),
});

export type ReadMarkdownFileOutput = z.output<typeof readMarkdownFile.output>;

// Reveal the file in the daemon machine's file manager (Finder on macOS).
export const revealMarkdownFile = defineRpc({
  name: "markdown.reveal",
  input: z.object(fileLocator),
  output: z.object({ absolutePath: z.string() }),
});

// Called once by every client on load. It carries no data; its purpose is to give the daemon side
// its first RPC call, which is where the plugin captures the Paseo API for background work.
export const pluginPing = defineRpc({
  name: "markdown.ping",
  input: z.object({}),
  output: z.object({ ok: z.literal(true) }),
});
