import type { PaseoAgentTimelineEvent, PaseoApi } from "@getpaseo/client";
import path from "node:path";
import { OPEN_MARKDOWN_KIND, OPEN_MARKDOWN_VERSION } from "../shared/open-request";
import { whenPaseo } from "./paseo-handle";
import { readFollowSettings } from "./settings-file";

// Follow mode. The daemon listens to every live agent's timeline. When an agent completes a
// write or edit of a markdown file, a row is appended to that agent's timeline naming the file;
// the row's renderer in the app opens it in a tab. Paseo normalises tool calls across providers,
// so this needs no knowledge of which agent implementation produced the edit.

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);
// Agents often touch one file several times in quick succession; the last edit wins.
const COALESCE_MS = 300;

type FollowedAgent = {
  cwd: string;
  unsubscribe: () => void;
  pending: ReturnType<typeof setTimeout> | null;
};

export type AgentDescriptor = { id: string; cwd: string; archivedAt?: string | null };

export function startFollowingAgents() {
  const followed = new Map<string, FollowedAgent>();
  let stopped = false;
  let unsubscribeDirectory: (() => void) | null = null;

  const follow = (paseo: PaseoApi, agent: AgentDescriptor) => {
    if (stopped || agent.archivedAt || followed.has(agent.id)) return;
    const unsubscribe = paseo.agents.ref(agent.id).timeline.subscribe((event) =>
      void onTimelineEvent(paseo, agent.id, event),
    );
    followed.set(agent.id, { cwd: agent.cwd, unsubscribe, pending: null });
  };

  const unfollow = (agentId: string) => {
    const entry = followed.get(agentId);
    if (!entry) return;
    entry.unsubscribe();
    if (entry.pending) clearTimeout(entry.pending);
    followed.delete(agentId);
  };

  const onTimelineEvent = async (paseo: PaseoApi, agentId: string, event: PaseoAgentTimelineEvent) => {
    const entry = followed.get(agentId);
    const filePath = entry && editedMarkdownPath(entry.cwd, event);
    if (!entry || !filePath) return;
    if (!(await readFollowSettings()).enabled) return;
    if (entry.pending) clearTimeout(entry.pending);
    entry.pending = setTimeout(() => void announce(paseo, agentId, filePath), COALESCE_MS);
  };

  // One stable row per agent: each new file replaces the previous follow row rather than
  // accumulating in the conversation.
  const announce = (paseo: PaseoApi, agentId: string, filePath: string) =>
    paseo.agents
      .ref(agentId)
      .timeline.append({
        type: "plugin",
        id: `follow:${agentId}`,
        kind: OPEN_MARKDOWN_KIND,
        version: OPEN_MARKDOWN_VERSION,
        data: { path: filePath, requestedAt: new Date().toISOString(), source: "follow" },
      })
      .then(() => console.log(`[follow] agent ${agentId} edited ${filePath}`))
      .catch((error) => console.error(`[follow] could not announce ${filePath} for agent ${agentId}`, error));

  // Existing agents come from a listing; later arrivals and departures from the agent-update
  // stream, backed up by the lifecycle hooks the entry point forwards to followAgent/unfollowAgent.
  void whenPaseo().then(async (paseo) => {
    if (stopped) return;
    unsubscribeDirectory = paseo.agents.subscribe((update) => {
      if (update.kind === "upsert") {
        if (update.agent.archivedAt) unfollow(update.agent.id);
        else follow(paseo, update.agent);
      } else if (update.kind === "remove") {
        unfollow(update.agentId);
      }
    });
    const listing = await paseo.agents.list({ filter: { includeArchived: false } }).catch((error) => {
      console.error("[follow] could not list agents", error);
      return null;
    });
    listing?.entries.forEach(({ agent }) => follow(paseo, agent));
    console.log(`[follow] following ${followed.size} agent(s)`);
  });

  return {
    followAgent: (agent: AgentDescriptor) => void whenPaseo().then((paseo) => follow(paseo, agent)),
    unfollowAgent: unfollow,
    stop() {
      stopped = true;
      unsubscribeDirectory?.();
      [...followed.keys()].forEach(unfollow);
    },
  };
}

// The absolute path of a markdown file this event reports as written or edited, or null.
function editedMarkdownPath(cwd: string, { event }: PaseoAgentTimelineEvent): string | null {
  if (event.type !== "timeline") return null;
  const item = event.item;
  if (item.type !== "tool_call" || item.status !== "completed") return null;
  const detail = item.detail;
  if (detail.type !== "write" && detail.type !== "edit") return null;
  const absolute = path.resolve(cwd, detail.filePath);
  return MARKDOWN_EXTENSIONS.has(path.extname(absolute).toLowerCase()) ? absolute : null;
}
