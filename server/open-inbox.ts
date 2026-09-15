import { watch, type FSWatcher } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { OPEN_MARKDOWN_KIND, OPEN_MARKDOWN_VERSION } from "../shared/open-request";
import { whenPaseo } from "./paseo-handle";

// Anything on the daemon machine can ask the panel to show a file by dropping a small JSON file
// into this directory. Agents do it from Bash via bin/open-markdown. No port is opened; the
// directory is owner-only.
export const INBOX_DIRECTORY = path.join(
  os.homedir(),
  ".paseo",
  "plugin-data",
  "paseo-markdown-viewer",
  "inbox",
);

const openRequest = z.object({
  agentId: z.string().min(1),
  path: z.string().min(1),
});

export function startOpenInbox(): () => void {
  let watcher: FSWatcher | null = null;
  const ready = fs
    .mkdir(INBOX_DIRECTORY, { recursive: true, mode: 0o700 })
    .then(() => {
      watcher = watch(INBOX_DIRECTORY, () => void drainInbox());
      watcher.on("error", (error) => console.error("[open-inbox] watcher error", error));
      return drainInbox();
    })
    .catch((error) => console.error("[open-inbox] failed to start", error));
  return () => {
    void ready.then(() => watcher?.close());
  };
}

// The watcher fires several events per file, so drains are queued one behind another rather
// than run concurrently; otherwise two drains read the same request before either removes it.
let draining: Promise<void> = Promise.resolve();
const drainInbox = () => (draining = draining.then(drainInboxOnce, drainInboxOnce));

// Process every pending request file, oldest first, removing each once handled.
async function drainInboxOnce() {
  const names = await fs.readdir(INBOX_DIRECTORY).catch(() => [] as string[]);
  const pending = names.filter((name) => name.endsWith(".json")).sort();
  await pending.reduce(
    (previous, name) => previous.then(() => handleRequestFile(path.join(INBOX_DIRECTORY, name))),
    Promise.resolve(),
  );
}

async function handleRequestFile(file: string) {
  const parsed = await readRequest(file);
  if (!parsed) return;
  await fs.unlink(file).catch(() => undefined);
  await appendOpenRow(parsed.agentId, parsed.path, path.basename(file, ".json"));
}

// A file that is not yet valid JSON is most likely still being written; leave it for the next
// event. A file that is valid but malformed is removed so it cannot jam the queue.
async function readRequest(file: string) {
  const text = await fs.readFile(file, "utf8").catch(() => null);
  if (text === null || text.trim() === "") return null;
  const json = tryParseJson(text);
  if (json === undefined) return null;
  const result = openRequest.safeParse(json);
  if (result.success) return result.data;
  console.error(`[open-inbox] ignoring malformed request ${path.basename(file)}:`, result.error.message);
  await fs.unlink(file).catch(() => undefined);
  return null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function appendOpenRow(agentId: string, requestedPath: string, requestId: string) {
  const paseo = await whenPaseo();
  try {
    await paseo.agents.ref(agentId).timeline.append({
      type: "plugin",
      id: `open-markdown:${requestId}`,
      kind: OPEN_MARKDOWN_KIND,
      version: OPEN_MARKDOWN_VERSION,
      data: { path: requestedPath, requestedAt: new Date().toISOString(), source: "request" },
    });
    console.log(`[open-inbox] asked agent ${agentId} panel to open ${requestedPath}`);
  } catch (error) {
    console.error(`[open-inbox] could not append open row for agent ${agentId}`, error);
  }
}
