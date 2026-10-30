// A small, dependency-free markdown parser producing a block tree for read-only rendering.
// It covers the everyday subset: headings, paragraphs, lists (incl. task boxes), fenced code,
// block quotes, tables, rules, YAML frontmatter, and inline emphasis / code / links / wikilinks.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "wikilink"; text: string }
  | { kind: "math"; tex: string };

export type ListItem = { depth: number; checked: boolean | null; children: Inline[] };

export type Block =
  | { kind: "frontmatter"; lines: string[] }
  | { kind: "heading"; level: number; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "math"; tex: string }
  | { kind: "quote"; children: Block[] }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "rule" };

type Step = { block: Block | null; rest: string[] };

// ---------------------------------------------------------------------------
// Document

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const { frontmatter, body } = splitFrontmatter(lines);
  const blocks = parseBlocks(body);
  return frontmatter ? [frontmatter, ...blocks] : blocks;
}

function splitFrontmatter(lines: string[]): { frontmatter: Block | null; body: string[] } {
  if (lines[0] !== "---") return { frontmatter: null, body: lines };
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) return { frontmatter: null, body: lines };
  return {
    frontmatter: { kind: "frontmatter", lines: lines.slice(1, end) },
    body: lines.slice(end + 1),
  };
}

// ---------------------------------------------------------------------------
// Blocks

function parseBlocks(lines: string[], acc: Block[] = []): Block[] {
  if (lines.length === 0) return acc;
  const { block, rest } = takeBlock(lines);
  return parseBlocks(rest, block ? [...acc, block] : acc);
}

const patterns = {
  blank: /^\s*$/,
  heading: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
  rule: /^\s*([-*_])(\s*\1){2,}\s*$/,
  fence: /^\s*(```|~~~)\s*([\w+-]*)\s*$/,
  mathBlock: /^\s*\$\$/,
  quote: /^\s*>\s?(.*)$/,
  listItem: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
  task: /^\[([ xX])\]\s+(.*)$/,
  tableRow: /^\s*\|.*\|\s*$/,
  tableSeparator: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
};

function takeBlock(lines: string[]): Step {
  const [first, ...rest] = lines;
  if (patterns.blank.test(first)) return { block: null, rest };
  if (patterns.mathBlock.test(first)) return takeMathBlock(first, rest);
  if (patterns.fence.test(first)) return takeCode(first, rest);
  if (patterns.heading.test(first)) return takeHeading(first, rest);
  if (patterns.rule.test(first)) return { block: { kind: "rule" }, rest };
  if (patterns.quote.test(first)) return takeQuote(lines);
  if (patterns.listItem.test(first)) return takeList(lines);
  if (patterns.tableRow.test(first) && patterns.tableSeparator.test(rest[0] ?? "")) {
    return takeTable(lines);
  }
  return takeParagraph(lines);
}

function takeHeading(line: string, rest: string[]): Step {
  const [, hashes, text] = line.match(patterns.heading)!;
  return { block: { kind: "heading", level: hashes.length, children: parseInlines(text) }, rest };
}

function takeCode(opening: string, rest: string[]): Step {
  const [, fence, language] = opening.match(patterns.fence)!;
  const closing = rest.findIndex((line) => line.trim() === fence);
  const body = closing === -1 ? rest : rest.slice(0, closing);
  return {
    block: { kind: "code", language, text: body.join("\n") },
    rest: closing === -1 ? [] : rest.slice(closing + 1),
  };
}

// `$$` alone opens a multi-line block; `$$...$$` on one line is a complete block.
function takeMathBlock(first: string, rest: string[]): Step {
  const sameLine = first.match(/^\s*\$\$(.+)\$\$\s*$/);
  if (sameLine) return { block: { kind: "math", tex: sameLine[1].trim() }, rest };
  const closing = rest.findIndex((line) => /^\s*\$\$\s*$/.test(line));
  const body = closing === -1 ? rest : rest.slice(0, closing);
  return {
    block: { kind: "math", tex: body.join("\n").trim() },
    rest: closing === -1 ? [] : rest.slice(closing + 1),
  };
}

function takeQuote(lines: string[]): Step {
  const quoted = takeWhile(lines, (line) => patterns.quote.test(line));
  const inner = quoted.map((line) => line.match(patterns.quote)![1]);
  return { block: { kind: "quote", children: parseBlocks(inner) }, rest: lines.slice(quoted.length) };
}

function takeList(lines: string[]): Step {
  const raw = takeWhile(lines, (line) => patterns.listItem.test(line));
  const items = raw.map(parseListItem);
  const ordered = /\d/.test(lines[0].match(patterns.listItem)![2]);
  return { block: { kind: "list", ordered, items }, rest: lines.slice(raw.length) };
}

function parseListItem(line: string): ListItem {
  const [, indent, , body] = line.match(patterns.listItem)!;
  const task = body.match(patterns.task);
  const text = task ? task[2] : body;
  const checked = task ? task[1] !== " " : null;
  return { depth: Math.floor(indent.replace(/\t/g, "  ").length / 2), checked, children: parseInlines(text) };
}

function takeTable(lines: string[]): Step {
  const raw = takeWhile(lines, (line) => patterns.tableRow.test(line));
  const [header, , ...rows] = raw.map(splitTableRow);
  return {
    block: { kind: "table", header, rows },
    rest: lines.slice(raw.length),
  };
}

const splitTableRow = (line: string): Inline[][] =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => parseInlines(cell.trim()));

function takeParagraph(lines: string[]): Step {
  const text = takeWhile(lines, (line, index) => index === 0 || isParagraphContinuation(line));
  return { block: { kind: "paragraph", children: parseInlines(text.join(" ")) }, rest: lines.slice(text.length) };
}

const isParagraphContinuation = (line: string) =>
  !patterns.blank.test(line) &&
  !patterns.heading.test(line) &&
  !patterns.fence.test(line) &&
  !patterns.mathBlock.test(line) &&
  !patterns.rule.test(line) &&
  !patterns.quote.test(line) &&
  !patterns.listItem.test(line) &&
  !patterns.tableRow.test(line);

function takeWhile<T>(items: T[], predicate: (item: T, index: number) => boolean): T[] {
  const stop = items.findIndex((item, index) => !predicate(item, index));
  return stop === -1 ? items : items.slice(0, stop);
}

// ---------------------------------------------------------------------------
// Inlines

const inlinePattern =
  /(`+)(.+?)\1|!\[([^\]]*)\]\([^)]*\)|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s](?:[^*]*[^*\s])?)\*|_([^_\s](?:[^_]*[^_\s])?)_|\$([^$\n]+)\$/g;

// A lone `$` wraps plain prices too (`$5 and $10`). Require a TeX-ish marker
// before treating the span as math, so currency ranges stay literal text.
const looksLikeMath = (tex: string) => /\\[a-zA-Z]|[\^_{}]/.test(tex);

export function parseInlines(text: string): Inline[] {
  const matches = [...text.matchAll(inlinePattern)];
  const { inlines, cursor } = matches.reduce(
    (state, match) => ({
      inlines: [...state.inlines, ...textBetween(text, state.cursor, match.index!), toInline(match)],
      cursor: match.index! + match[0].length,
    }),
    { inlines: [] as Inline[], cursor: 0 },
  );
  return [...inlines, ...textBetween(text, cursor, text.length)];
}

const textBetween = (text: string, from: number, to: number): Inline[] =>
  to > from ? [{ kind: "text", text: text.slice(from, to) }] : [];

function toInline(match: RegExpMatchArray): Inline {
  const [, , code, imageAlt, wikiTarget, wikiAlias, linkText, href, strongA, strongB, emA, emB, math] = match;
  if (code !== undefined) return { kind: "code", text: code };
  if (imageAlt !== undefined) return { kind: "text", text: `[image: ${imageAlt || "untitled"}]` };
  if (wikiTarget !== undefined) return { kind: "wikilink", text: wikiAlias ?? wikiTarget };
  if (linkText !== undefined) return { kind: "link", text: linkText, href };
  if (strongA ?? strongB) return { kind: "strong", children: parseInlines(strongA ?? strongB) };
  if (math !== undefined) {
    if (!looksLikeMath(math)) return { kind: "text", text: `$${math}$` };
    return { kind: "math", tex: math.trim() };
  }
  return { kind: "em", children: parseInlines(emA ?? emB) };
}
