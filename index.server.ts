import type { PluginServerContext } from "@getpaseo/plugin/server";
import { startFollowingAgents } from "./server/follow-agents";
import { awaitMarkdownChangeHandler, readMarkdownFileHandler } from "./server/markdown-file";
import { startOpenInbox } from "./server/open-inbox";
import { capturePaseo, capturing } from "./server/paseo-handle";
import { renderFormula } from "./server/render";
import { revealMarkdownFileHandler } from "./server/reveal";
import { followSettings } from "./shared/follow-settings";
import { awaitMarkdownChange, pluginPing, readMarkdownFile, revealMarkdownFile } from "./shared/markdown-file";
import { renderMath } from "./shared/render";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(followSettings);

  server.handle(readMarkdownFile, capturing(readMarkdownFileHandler));
  server.handle(awaitMarkdownChange, capturing(awaitMarkdownChangeHandler));
  server.handle(revealMarkdownFile, capturing(revealMarkdownFileHandler));
  server.handle(pluginPing, capturing(() => ({ ok: true as const })));
  server.handle(renderMath, renderFormula);

  const following = startFollowingAgents();
  const stopInbox = startOpenInbox();

  // Every hook is a chance to capture the Paseo API; the agent hooks also keep the follower's
  // roster current, independent of the agent-update stream.
  const unsubscribe = [
    server.on("agent.created", ({ agent }, { paseo }) => {
      capturePaseo(paseo);
      following.followAgent(agent);
    }),
    server.on("agent.archived", ({ agent }, { paseo }) => {
      capturePaseo(paseo);
      following.unfollowAgent(agent.id);
    }),
    server.on("agent.turn_started", ({ agent }, { paseo }) => {
      capturePaseo(paseo);
      following.followAgent(agent);
    }),
    server.on("agent.turn_ended", (_event, { paseo }) => capturePaseo(paseo)),
    server.on("workspace.created", (_event, { paseo }) => capturePaseo(paseo)),
  ];

  return () => {
    following.stop();
    stopInbox();
    unsubscribe.forEach((remove) => remove());
  };
}
