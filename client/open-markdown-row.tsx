import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useAgent, useSettings } from "@getpaseo/plugin/client";
import { useEffect, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { followSettings } from "../shared/follow-settings";
import type { OpenMarkdownRowData } from "../shared/open-request";
import { openMarkdownInPanel } from "./panel-bridge";

// Rows older than this client session are history; show them but do not act on them.
const CLIENT_STARTED_AT = Date.now();
const handled = new Set<string>();

// Drawn in the agent's conversation when a file should be shown in the panel. On first appearance
// of a fresh row it opens a tab: explicit requests switch to it and bring the panel forward;
// follow-mode rows leave it in the background with an unread dot, per the follow settings. Afterwards it stays as a record with an Open button.
export function OpenMarkdownRow({ theme, layout, agentId, item }: PluginTimelineItemProps<OpenMarkdownRowData>) {
  const workspaceId = useAgent(agentId, (agent) => agent.workspaceId);
  const follow = useSettings(followSettings);
  const followValues = follow.status === "ready" ? follow.values : null;
  const { path, requestedAt, source } = item.data;
  const key = `${agentId}:${requestedAt}:${path}`;
  const styles = useMemo(() => buildStyles(theme, layout.compact), [theme, layout.compact]);

  useEffect(() => {
    if (!workspaceId || handled.has(key) || !isFresh(requestedAt)) return;
    if (source === "follow") {
      if (!followValues) return; // settings still loading; try again when they arrive
      handled.add(key);
      if (followValues.enabled) {
        openMarkdownInPanel(workspaceId, path, { activate: false, bringForward: followValues.bringForward });
      }
      return;
    }
    handled.add(key);
    openMarkdownInPanel(workspaceId, path, { activate: true, bringForward: true });
  }, [workspaceId, key, requestedAt, path, source, followValues]);

  return (
    <View style={styles.card}>
      <View style={styles.textColumn}>
        <Text style={styles.label}>{source === "follow" ? "Following in Markdown panel" : "Markdown panel"}</Text>
        <Text style={styles.path} numberOfLines={2}>
          {path}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${path} in the markdown panel`}
        disabled={!workspaceId}
        onPress={() => workspaceId && openMarkdownInPanel(workspaceId, path, { activate: true, bringForward: true })}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Open</Text>
      </Pressable>
    </View>
  );
}

const isFresh = (requestedAt: string) => new Date(requestedAt).getTime() >= CLIENT_STARTED_AT;

function buildStyles(theme: PluginTimelineItemProps["theme"], compact: boolean) {
  const { colors } = theme;
  return {
    card: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      padding: compact ? 10 : 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface1,
    },
    textColumn: { flex: 1, gap: 2 },
    label: { color: colors.foregroundMuted, fontSize: 11, textTransform: "uppercase" as const },
    path: { color: colors.foreground, fontSize: 14 },
    button: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, backgroundColor: colors.accent },
    buttonText: { color: colors.accentForeground, fontSize: 13, fontWeight: "600" as const },
  };
}
