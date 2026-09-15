import type { RpcInput } from "@getpaseo/plugin";
import { execFile } from "node:child_process";
import path from "node:path";
import type { revealMarkdownFile } from "../shared/markdown-file";
import { assertMarkdownExtension, resolvePath } from "./markdown-file";

// Show the file in the daemon machine's file manager. The path goes through the same resolver
// and extension check as reading, so only a file the panel could display can be revealed.
export async function revealMarkdownFileHandler({
  workspaceDirectory,
  path: requestedPath,
}: RpcInput<typeof revealMarkdownFile>) {
  const absolutePath = await resolvePath(workspaceDirectory, requestedPath);
  assertMarkdownExtension(absolutePath);
  const [command, args] = revealCommand(absolutePath);
  await run(command, args);
  return { absolutePath };
}

// Each platform's "select this file" incantation; no shell is involved.
function revealCommand(absolutePath: string): [string, string[]] {
  switch (process.platform) {
    case "darwin":
      return ["open", ["-R", absolutePath]];
    case "win32":
      return ["explorer.exe", [`/select,${absolutePath}`]];
    default:
      return ["xdg-open", [path.dirname(absolutePath)]];
  }
}

const run = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    execFile(command, args, { timeout: 10_000 }, (error) =>
      error ? reject(new Error(`Could not reveal file: ${error.message}`)) : resolve(),
    );
  });
