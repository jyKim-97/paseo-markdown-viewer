import type { RpcInput } from "@getpaseo/plugin";
import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ReadMarkdownFileOutput } from "../shared/markdown-file";
import type { awaitMarkdownChange, readMarkdownFile } from "../shared/markdown-file";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);
const MAX_BYTES = 2 * 1024 * 1024;

// Each long poll gives up well inside Paseo's RPC timeout; the client re-arms immediately.
const WATCH_TIMEOUT_MS = 20_000;
// Belt and braces for writers that slip past FSEvents (network mounts, some sync clients).
const WATCH_POLL_MS = 1_500;

// ---------------------------------------------------------------------------
// Read

export async function readMarkdownFileHandler({
  workspaceDirectory,
  path: requestedPath,
}: RpcInput<typeof readMarkdownFile>): Promise<ReadMarkdownFileOutput> {
  const absolutePath = await resolvePath(workspaceDirectory, requestedPath);
  assertMarkdownExtension(absolutePath);
  const stats = await fs.stat(absolutePath);
  assertRegularFile(stats.isFile(), requestedPath);
  assertWithinSizeLimit(stats.size, requestedPath);
  const content = await fs.readFile(absolutePath, "utf8");
  return { absolutePath, content, modifiedAt: stats.mtime.toISOString(), version: versionOf(content) };
}

// ---------------------------------------------------------------------------
// Watch

export async function awaitMarkdownChangeHandler({
  workspaceDirectory,
  path: requestedPath,
  version,
}: RpcInput<typeof awaitMarkdownChange>) {
  const absolutePath = await resolvePath(workspaceDirectory, requestedPath).catch(() => null);
  // The file has gone or moved: report a change so the client re-reads and shows the error.
  if (!absolutePath) return { changed: true };
  return waitForChange(absolutePath, version);
}

function waitForChange(absolutePath: string, knownVersion: string): Promise<{ changed: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (changed: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ changed });
    };
    const check = () =>
      currentVersion(absolutePath).then((current) => current !== knownVersion && finish(true));

    const watcher = watchDirectory(absolutePath, check);
    const poll = setInterval(check, WATCH_POLL_MS);
    const deadline = setTimeout(() => finish(false), WATCH_TIMEOUT_MS);
    const cleanup = () => {
      watcher?.close();
      clearInterval(poll);
      clearTimeout(deadline);
    };

    // The content may have changed between the read and this call; look once straight away.
    void check();
  });
}

// Watching the parent directory rather than the file survives editors that save by writing a
// temporary file and renaming it over the original, which would orphan a watch on the file itself.
function watchDirectory(absolutePath: string, onChange: () => void): FSWatcher | null {
  const target = path.basename(absolutePath);
  try {
    const watcher = watch(path.dirname(absolutePath), (_event, filename) => {
      if (filename === null || filename.toString() === target) onChange();
    });
    watcher.on("error", () => watcher.close());
    return watcher;
  } catch {
    return null;
  }
}

// A missing or unreadable file counts as a change so the client re-reads and surfaces it.
const currentVersion = (absolutePath: string) =>
  fs.readFile(absolutePath, "utf8").then(versionOf, () => "unreadable");

const versionOf = (content: string) => createHash("sha1").update(content).digest("hex");

// ---------------------------------------------------------------------------
// Path resolution

// Relative paths resolve against the workspace and may not escape it, following symlinks so a
// link cannot be used as an escape hatch. Absolute paths (and `~/...`) are honoured as typed:
// the path box is driven by the user alone, so this reads exactly what they could open themselves.
export async function resolvePath(workspaceDirectory: string, requestedPath: string) {
  const expanded = expandHome(requestedPath);
  if (path.isAbsolute(expanded)) return realpathOrNotFound(expanded, requestedPath);
  const root = await fs.realpath(workspaceDirectory);
  const candidate = await realpathOrNotFound(path.resolve(root, expanded), requestedPath);
  if (!isInside(root, candidate)) {
    throw new Error(`Refusing to read outside the workspace: ${requestedPath}`);
  }
  return candidate;
}

const expandHome = (requestedPath: string) =>
  requestedPath === "~" || requestedPath.startsWith("~/")
    ? path.join(os.homedir(), requestedPath.slice(1))
    : requestedPath;

async function realpathOrNotFound(candidate: string, requestedPath: string) {
  try {
    return await fs.realpath(candidate);
  } catch {
    throw new Error(`File not found: ${requestedPath}`);
  }
}

const isInside = (root: string, candidate: string) =>
  candidate === root || candidate.startsWith(root + path.sep);

export function assertMarkdownExtension(absolutePath: string) {
  const extension = path.extname(absolutePath).toLowerCase();
  if (!MARKDOWN_EXTENSIONS.has(extension)) {
    throw new Error(`Not a markdown file (expected .md, .markdown or .mdx): ${path.basename(absolutePath)}`);
  }
}

function assertRegularFile(isFile: boolean, requestedPath: string) {
  if (!isFile) throw new Error(`Not a file: ${requestedPath}`);
}

function assertWithinSizeLimit(size: number, requestedPath: string) {
  if (size > MAX_BYTES) throw new Error(`File too large to preview (over 2 MB): ${requestedPath}`);
}
