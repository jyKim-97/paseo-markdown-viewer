import type { PluginTheme } from "@getpaseo/plugin";
import { Fragment, useMemo } from "react";
import { Platform, Text, View } from "react-native";
import { Formula } from "./formula";
import type { Block, Inline, ListItem } from "./markdown-parser";

type Styles = ReturnType<typeof buildStyles>;
// Formulas need a cache namespace (hostId) and a hex color, which the block/inline
// tree does not otherwise carry.
type MathCtx = { hostId: string; color: string; maxInlineWidth: number };

// Renders a parsed markdown block tree with React Native primitives only, so it works on
// desktop, browser, and mobile and follows the active Paseo theme.
export function MarkdownView({
  blocks,
  theme,
  compact,
  hostId,
}: {
  blocks: Block[];
  theme: PluginTheme;
  compact: boolean;
  hostId: string;
}) {
  const styles = useMemo(() => buildStyles(theme, compact), [theme, compact]);
  // document content is capped at 820px (see markdown-document.tsx); approximate the
  // readable column width so an inline formula shrinks instead of overflowing it.
  const math: MathCtx = { hostId, color: theme.colors.foreground, maxInlineWidth: 760 };
  return (
    <View style={styles.document}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} styles={styles} math={math} />
      ))}
    </View>
  );
}

function BlockView({ block, styles, math }: { block: Block; styles: Styles; math: MathCtx }) {
  switch (block.kind) {
    case "frontmatter":
      return (
        <View style={styles.frontmatter}>
          {block.lines.map((line, index) => (
            <Text key={index} style={styles.frontmatterLine}>
              {line}
            </Text>
          ))}
        </View>
      );
    case "heading":
      return (
        <Text style={[styles.heading, styles.headingLevels[block.level - 1]]}>
          <Inlines inlines={block.children} styles={styles} math={math} />
        </Text>
      );
    case "paragraph":
      return (
        <Text style={styles.paragraph}>
          <Inlines inlines={block.children} styles={styles} math={math} />
        </Text>
      );
    case "code":
      return (
        <View style={styles.codeBlock}>
          {block.language ? <Text style={styles.codeLanguage}>{block.language}</Text> : null}
          <Text style={styles.codeText}>{block.text}</Text>
        </View>
      );
    case "math":
      return (
        <Formula
          expression={block.tex}
          source={`$$${block.tex}$$`}
          display
          block
          color={math.color}
          hostId={math.hostId}
          textStyle={styles.paragraph}
          maxInlineWidth={math.maxInlineWidth}
        />
      );
    case "quote":
      return (
        <View style={styles.quote}>
          {block.children.map((child, index) => (
            <BlockView key={index} block={child} styles={styles} math={math} />
          ))}
        </View>
      );
    case "list":
      return (
        <View style={styles.list}>
          {block.items.map((item, index) => (
            <ListItemView
              key={index}
              item={item}
              marker={listMarker(block.ordered, block.items, index)}
              styles={styles}
              math={math}
            />
          ))}
        </View>
      );
    case "table":
      return <TableView header={block.header} rows={block.rows} styles={styles} math={math} />;
    case "rule":
      return <View style={styles.rule} />;
  }
}

function ListItemView({
  item,
  marker,
  styles,
  math,
}: {
  item: ListItem;
  marker: string;
  styles: Styles;
  math: MathCtx;
}) {
  return (
    <View style={[styles.listItem, { paddingLeft: item.depth * 18 }]}>
      <Text style={styles.listMarker}>{item.checked === null ? marker : item.checked ? "☑" : "☐"}</Text>
      <Text style={[styles.paragraph, styles.listText, item.checked ? styles.checked : null]}>
        <Inlines inlines={item.children} styles={styles} math={math} />
      </Text>
    </View>
  );
}

// Ordered lists count only their siblings at the same depth.
function listMarker(ordered: boolean, items: ListItem[], index: number) {
  if (!ordered) return "•";
  const position = items
    .slice(0, index + 1)
    .filter((item) => item.depth === items[index].depth).length;
  return `${position}.`;
}

function TableView({
  header,
  rows,
  styles,
  math,
}: {
  header: Inline[][];
  rows: Inline[][][];
  styles: Styles;
  math: MathCtx;
}) {
  return (
    <View style={styles.table}>
      <TableRow cells={header} styles={styles} math={math} isHeader />
      {rows.map((cells, index) => (
        <TableRow key={index} cells={cells} styles={styles} math={math} isHeader={false} />
      ))}
    </View>
  );
}

function TableRow({
  cells,
  styles,
  math,
  isHeader,
}: {
  cells: Inline[][];
  styles: Styles;
  math: MathCtx;
  isHeader: boolean;
}) {
  return (
    <View style={[styles.tableRow, isHeader ? styles.tableHeaderRow : null]}>
      {cells.map((cell, index) => (
        <Text key={index} style={[styles.tableCell, isHeader ? styles.tableHeaderCell : null]}>
          <Inlines inlines={cell} styles={styles} math={math} />
        </Text>
      ))}
    </View>
  );
}

function Inlines({ inlines, styles, math }: { inlines: Inline[]; styles: Styles; math: MathCtx }) {
  return (
    <Fragment>
      {inlines.map((inline, index) => (
        <InlineView key={index} inline={inline} styles={styles} math={math} />
      ))}
    </Fragment>
  );
}

function InlineView({ inline, styles, math }: { inline: Inline; styles: Styles; math: MathCtx }) {
  switch (inline.kind) {
    case "text":
      return <Text>{inline.text}</Text>;
    case "strong":
      return (
        <Text style={styles.strong}>
          <Inlines inlines={inline.children} styles={styles} math={math} />
        </Text>
      );
    case "em":
      return (
        <Text style={styles.em}>
          <Inlines inlines={inline.children} styles={styles} math={math} />
        </Text>
      );
    case "code":
      return <Text style={styles.inlineCode}>{inline.text}</Text>;
    case "math":
      return (
        <Formula
          expression={inline.tex}
          source={`$${inline.tex}$`}
          display={false}
          block={false}
          color={math.color}
          hostId={math.hostId}
          textStyle={styles.paragraph}
          maxInlineWidth={math.maxInlineWidth}
        />
      );
    case "link":
      return <Text style={styles.link}>{inline.text}</Text>;
    case "wikilink":
      return <Text style={styles.link}>{inline.text}</Text>;
  }
}

const monospace = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function buildStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  const baseSize = compact ? 15 : 16;
  const headingSizes = [30, 24, 20, 18, 16, 15].map((size) => (compact ? size - 2 : size));
  return {
    document: { gap: compact ? 10 : 14 },
    frontmatter: {
      padding: 10,
      borderRadius: 8,
      backgroundColor: colors.surface1,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 2,
    },
    frontmatterLine: { color: colors.foregroundMuted, fontFamily: monospace, fontSize: baseSize - 3 },
    heading: { color: colors.foreground, fontWeight: "700" as const, marginTop: compact ? 6 : 10 },
    headingLevels: headingSizes.map((fontSize) => ({ fontSize, lineHeight: Math.round(fontSize * 1.3) })),
    paragraph: { color: colors.foreground, fontSize: baseSize, lineHeight: Math.round(baseSize * 1.55) },
    strong: { fontWeight: "700" as const },
    em: { fontStyle: "italic" as const },
    inlineCode: {
      fontFamily: monospace,
      fontSize: baseSize - 2,
      color: colors.foreground,
      backgroundColor: colors.surface2,
      borderRadius: 4,
    },
    link: { color: colors.accent, textDecorationLine: "underline" as const },
    codeBlock: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.surface1,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    codeLanguage: { color: colors.foregroundMuted, fontSize: baseSize - 4, textTransform: "uppercase" as const },
    codeText: { fontFamily: monospace, fontSize: baseSize - 2, lineHeight: Math.round(baseSize * 1.4), color: colors.foreground },
    quote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      paddingLeft: 12,
      gap: 8,
    },
    list: { gap: 4 },
    listItem: { flexDirection: "row" as const, gap: 8 },
    listMarker: { color: colors.foregroundMuted, fontSize: baseSize, lineHeight: Math.round(baseSize * 1.55), minWidth: 18 },
    listText: { flex: 1 },
    checked: { color: colors.foregroundMuted, textDecorationLine: "line-through" as const },
    table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" as const },
    tableRow: { flexDirection: "row" as const, borderTopWidth: 1, borderTopColor: colors.border },
    tableHeaderRow: { borderTopWidth: 0, backgroundColor: colors.surface1 },
    tableCell: { flex: 1, padding: 8, color: colors.foreground, fontSize: baseSize - 1 },
    tableHeaderCell: { fontWeight: "700" as const },
    rule: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  };
}
