import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// Follow mode: when an agent writes or edits a markdown file, the panel opens it in a tab.
// Host-scoped, so every client of this daemon shares the switch. Paseo stores the document at
// $PASEO_HOME/plugin-settings/paseo-markdown-viewer/follow.json.
export const followSettings = defineSettings({
  id: "follow",
  scope: "host",
  version: 1,
  schema: z.object({
    // Follow agent edits at all.
    enabled: z.boolean().default(true),
    // Also bring the panel to the front. Off means the panel only updates while already open.
    bringForward: z.boolean().default(false),
  }),
});

export type FollowSettings = z.output<typeof followSettings.schema>;

export const FOLLOW_DEFAULTS: FollowSettings = followSettings.schema.parse({});
