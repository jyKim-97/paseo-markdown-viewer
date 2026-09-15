import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FOLLOW_DEFAULTS, followSettings, type FollowSettings } from "../shared/follow-settings";

// The 0.8 SDK gives the daemon side no handle to read a settings document, so we read the file
// Paseo persists for the client: $PASEO_HOME/plugin-settings/<plugin>/<settings id>.json, an
// envelope { version, values }. Anything unreadable or from another version yields the defaults.

const PLUGIN_ID = "paseo-markdown-viewer";
const CACHE_MS = 2_000;

export function paseoHome(): string {
  const raw = process.env.PASEO_HOME?.trim();
  if (!raw) return path.join(os.homedir(), ".paseo");
  return raw.startsWith("~/") ? path.join(os.homedir(), raw.slice(2)) : path.resolve(raw);
}

const settingsFile = path.join(paseoHome(), "plugin-settings", PLUGIN_ID, `${followSettings.id}.json`);

let cached: { at: number; values: FollowSettings } | null = null;

export async function readFollowSettings(): Promise<FollowSettings> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.values;
  const values = await parseSettingsFile();
  cached = { at: Date.now(), values };
  return values;
}

async function parseSettingsFile(): Promise<FollowSettings> {
  try {
    const envelope = JSON.parse(await fs.readFile(settingsFile, "utf8")) as {
      version?: unknown;
      values?: unknown;
    };
    if (envelope.version !== followSettings.version) return FOLLOW_DEFAULTS;
    const parsed = followSettings.schema.safeParse(envelope.values ?? {});
    return parsed.success ? parsed.data : FOLLOW_DEFAULTS;
  } catch {
    return FOLLOW_DEFAULTS;
  }
}
