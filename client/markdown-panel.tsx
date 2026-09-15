import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useSettings, useWorkspace } from "@getpaseo/plugin/client";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { followSettings } from "../shared/follow-settings";
import { MarkdownDocument } from "./markdown-document";
import { activateTab, closeTab, openTab, useTabs } from "./panel-tabs";
import { TabWatcher } from "./tab-watcher";

// The panel: a toolbar to open files and steer follow mode, a row of tabs, and the active document.
export function MarkdownPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const directory = useWorkspace(workspaceId, (workspace) => workspace.directory);
  const tabs = useTabs(workspaceId);
  const styles = useMemo(() => buildStyles(theme, layout.compact), [theme, layout.compact]);

  return (
    <View style={styles.screen}>
      <Toolbar onOpen={(path) => openTab(workspaceId, path)} styles={styles} />
      <TabBar
        paths={tabs.paths}
        active={tabs.active}
        unread={tabs.unread}
        onActivate={(path) => activateTab(workspaceId, path)}
        onClose={(path) => closeTab(workspaceId, path)}
        styles={styles}
      />
      {directory
        ? tabs.paths
            .filter((path) => path !== tabs.active)
            .map((path) => <TabWatcher key={path} workspaceId={workspaceId} directory={directory} path={path} />)
        : null}
      {tabs.active && directory ? (
        <MarkdownDocument
          key={tabs.active}
          workspaceId={workspaceId}
          directory={directory}
          path={tabs.active}
          theme={theme}
          compact={layout.compact}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {directory
              ? "No file open. Type a path above, run /md <path>, or let an agent edit a markdown file."
              : "Waiting for workspace…"}
          </Text>
        </View>
      )}
    </View>
  );
}

// Path entry plus the two follow-mode switches. The path field keeps its own draft; a tab opens
// on submit.
function Toolbar({ onOpen, styles }: { onOpen: (path: string) => void; styles: Styles }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (draft.trim()) onOpen(draft);
    setDraft("");
  };
  return (
    <View style={styles.toolbar}>
      <TextInput
        accessibilityLabel="Markdown file path, relative to the workspace or absolute"
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={submit}
        placeholder="Open a file: docs/notes.md"
        placeholderTextColor={styles.placeholder.color}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        style={styles.pathInput}
      />
      <FollowSwitches styles={styles} />
    </View>
  );
}

function FollowSwitches({ styles }: { styles: Styles }) {
  const follow = useSettings(followSettings);
  if (follow.status !== "ready") {
    return <Text style={styles.switchMuted}>{follow.status === "loading" ? "…" : "Follow: unavailable"}</Text>;
  }
  const { values, revision, save, saving } = follow;
  const toggle = (patch: Partial<typeof values>) => void save({ ...values, ...patch }, revision);
  return (
    <View style={styles.switches}>
      <SwitchPill
        label="Follow agents"
        on={values.enabled}
        disabled={saving}
        onPress={() => toggle({ enabled: !values.enabled })}
        styles={styles}
      />
      <SwitchPill
        label="Bring forward"
        on={values.bringForward}
        disabled={saving || !values.enabled}
        onPress={() => toggle({ bringForward: !values.bringForward })}
        styles={styles}
      />
    </View>
  );
}

function SwitchPill({
  label,
  on,
  disabled,
  onPress,
  styles,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.switchPill, on ? styles.switchPillOn : null, disabled ? styles.switchPillDisabled : null]}
    >
      <Text style={[styles.switchText, on ? styles.switchTextOn : null]}>{label}</Text>
    </Pressable>
  );
}

function TabBar({
  paths,
  active,
  unread,
  onActivate,
  onClose,
  styles,
}: {
  paths: readonly string[];
  active: string | null;
  unread: readonly string[];
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  styles: Styles;
}) {
  if (paths.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
      {paths.map((path) => (
        <Tab
          key={path}
          path={path}
          active={path === active}
          unread={unread.includes(path)}
          onActivate={onActivate}
          onClose={onClose}
          styles={styles}
        />
      ))}
    </ScrollView>
  );
}

function Tab({
  path,
  active,
  unread,
  onActivate,
  onClose,
  styles,
}: {
  path: string;
  active: boolean;
  unread: boolean;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  styles: Styles;
}) {
  return (
    <View style={[styles.tab, active ? styles.tabActive : null]}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={path}
        onPress={() => onActivate(path)}
        style={styles.tabLabelArea}
      >
        <StatusDot active={active} unread={unread} styles={styles} />
        <Text style={[styles.tabText, active ? styles.tabTextActive : null]} numberOfLines={1}>
          {baseName(path)}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Close ${baseName(path)}`}
        onPress={() => onClose(path)}
        hitSlop={6}
        style={styles.tabClose}
      >
        <Text style={styles.tabCloseText}>×</Text>
      </Pressable>
    </View>
  );
}

// Mirrors Paseo's agent list: a ring for the selected item, a green dot for unseen changes,
// and a faint dot otherwise.
function StatusDot({ active, unread, styles }: { active: boolean; unread: boolean; styles: Styles }) {
  if (active) {
    return (
      <View style={styles.dotRing}>
        <View style={styles.dotRingCore} />
      </View>
    );
  }
  return <View style={[styles.dot, unread ? styles.dotUnread : null]} />;
}

const baseName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

type Styles = ReturnType<typeof buildStyles>;

function buildStyles(theme: PluginWorkspacePanelProps["theme"], compact: boolean) {
  const { colors } = theme;
  const padding = compact ? 12 : 20;
  return {
    screen: { flex: 1, backgroundColor: colors.surface0 },
    toolbar: {
      flexDirection: compact ? ("column" as const) : ("row" as const),
      alignItems: compact ? ("stretch" as const) : ("center" as const),
      gap: 8,
      paddingHorizontal: padding,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface1,
    },
    pathInput: {
      flex: compact ? undefined : 1,
      color: colors.foreground,
      fontSize: 14,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface0,
    },
    placeholder: { color: colors.foregroundMuted },
    switches: { flexDirection: "row" as const, gap: 6 },
    switchPill: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface0,
    },
    switchPillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    switchPillDisabled: { opacity: 0.5 },
    switchText: { color: colors.foregroundMuted, fontSize: 12 },
    switchTextOn: { color: colors.accentForeground },
    switchMuted: { color: colors.foregroundMuted, fontSize: 12 },
    tabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface1 },
    tabBarContent: { paddingHorizontal: padding - 8, gap: 2 },
    tab: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingLeft: 12,
      paddingRight: 4,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabActive: { borderBottomColor: colors.accent },
    tabLabelArea: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingVertical: 8,
      maxWidth: 240,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
    dotUnread: { backgroundColor: colors.statusSuccess },
    dotRing: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.accent,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginHorizontal: -2,
    },
    dotRingCore: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.accent },
    tabText: { color: colors.foregroundMuted, fontSize: 13 },
    tabTextActive: { color: colors.foreground },
    tabClose: { paddingHorizontal: 6, paddingVertical: 4 },
    tabCloseText: { color: colors.foregroundMuted, fontSize: 14, lineHeight: 16 },
    empty: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, padding },
    emptyText: { color: colors.foregroundMuted, fontSize: 14, textAlign: "center" as const, maxWidth: 420 },
  };
}
