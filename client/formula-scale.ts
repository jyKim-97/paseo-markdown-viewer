// Formula rendering copied unmodified from q5m-ai/paseo-math (Apache-2.0).
// https://github.com/q5m-ai/paseo-math — Copyright 2026 q5m-ai contributors.
// Rendered math sits at 1em by default, which reads smaller than body text
// (KaTeX uses 1.21em). PNGs are 2x, so up to 2x stays sharp.
export const FORMULA_SCALE = 1.2;

export function formulaScale({
  fontSize,
  fontScale,
  block,
  display,
  platform,
  maxInlineWidth,
  width,
}: {
  fontSize: number;
  fontScale: number;
  block: boolean;
  display: boolean;
  platform: string;
  maxInlineWidth: number;
  width: number;
}): number {
  const mobileDisplay =
    block && display && (platform === "android" || platform === "ios");
  const natural =
    (fontSize / 16) * fontScale * FORMULA_SCALE * (mobileDisplay ? 1.25 : 1);
  // Blocks scroll at their readable size; only inline attachments fit the row.
  return block
    ? natural
    : Math.min(natural, Math.max(1, maxInlineWidth) / width);
}
