import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { readMarkdownFile, revealMarkdownFile } from "../shared/markdown-file";
import { parseMarkdown } from "./markdown-parser";
import { MarkdownView } from "./markdown-view";
import { useFileWatch } from "./use-file-watch";

// Live updates come from the daemon-side watcher (see useFileWatch). These polls are only a
// safety net: quick while the file is missing so it appears once created, slow otherwise.
const ERROR_RETRY_MS = 3_000;
const FALLBACK_REFRESH_MS = 60_000;

// One open file: read it, keep it fresh, render it, and offer to reveal it in Finder.
export function MarkdownDocument({
  workspaceId,
  directory,
  path,
  theme,
  compact,
}: {
  workspaceId: string;
  directory: string;
  path: string;
  theme: PluginTheme;
  compact: boolean;
}) {
  const read = useRpc(readMarkdownFile);
  const revealFile = useRpc(revealMarkdownFile);
  const styles = useMemo(() => buildStyles(theme, compact), [theme, compact]);

  const file = useQuery({
    queryKey: ["paseo-markdown-viewer", workspaceId, directory, path],
    queryFn: () => read({ workspaceDirectory: directory, path }),
    refetchInterval: (query) => (query.state.error ? ERROR_RETRY_MS : FALLBACK_REFRESH_MS),
    retry: false,
  });
  useFileWatch({ directory, path, version: file.data?.version, refetch: file.refetch });

  const reveal = useMutation({ mutationFn: () => revealFile({ workspaceDirectory: directory, path }) });
  const blocks = useMemo(() => (file.data ? parseMarkdown(file.data.content) : []), [file.data]);

  return (
    <View style={styles.document}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {file.error ? (
          <Text style={styles.error}>{describeError(file.error)}</Text>
        ) : file.data ? (
          <MarkdownView blocks={blocks} theme={theme} compact={compact} hostId={path} />
        ) : (
          <Text style={styles.muted}>Loading…</Text>
        )}
      </ScrollView>
      {file.data ? (
        <View style={styles.footer}>
          <Text style={styles.footerText} numberOfLines={1}>
            Read only · live · {file.data.absolutePath} · saved {formatTime(file.data.modifiedAt)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show this file in Finder"
            disabled={reveal.isPending}
            onPress={() => reveal.mutate()}
            style={[styles.revealButton, reveal.isPending ? styles.revealButtonDisabled : null]}
          >
            <Text style={styles.revealButtonText}>{reveal.isPending ? "Opening…" : "Show in Finder"}</Text>
          </Pressable>
        </View>
      ) : null}
      {reveal.error ? <Text style={styles.revealError}>{describeError(reveal.error)}</Text> : null}
    </View>
  );
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
};

function buildStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  const padding = compact ? 12 : 20;
  return {
    document: { flex: 1 },
    scroll: { flex: 1 },
    content: { padding, paddingBottom: padding * 2, maxWidth: 820, width: "100%" as const, alignSelf: "center" as const },
    muted: { color: colors.foregroundMuted },
    error: { color: colors.statusDanger, fontSize: 14, lineHeight: 20 },
    footer: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingHorizontal: padding,
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerText: { flex: 1, color: colors.foregroundMuted, fontSize: 11 },
    revealButton: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
    },
    revealButtonDisabled: { opacity: 0.5 },
    revealButtonText: { color: colors.foreground, fontSize: 12 },
    revealError: { color: colors.statusDanger, fontSize: 12, paddingHorizontal: padding, paddingVertical: 6 },
  };
}
