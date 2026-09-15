# Paseo Markdown Viewer

A [Paseo](https://paseo.sh) plugin that adds a read-only **Markdown** panel to every workspace. Open
any markdown file in a tab, watch it update the moment it changes on disk, and let the panel follow
the files your agents write.

Requires **Paseo 0.8 or newer**.

## What it does

- **Tabbed viewer.** Each file has its own tab. Headings, lists, task boxes, tables, fenced code,
  block quotes, links, Obsidian wikilinks and YAML frontmatter all render with React Native
  primitives, so the panel works on desktop, in the browser and on phones, in every Paseo theme.
- **Live updates.** The daemon watches each open file with the operating system's file events and
  the panel re-reads within milliseconds of a save, including atomic saves that rename a temporary
  file over the original.
- **Follow mode.** When an agent writes or edits a markdown file, that file gets a tab. The tab waits
  in the background with a green dot until you look at it, mirroring how Paseo marks agents with
  changes. Paseo normalises tool calls across providers, so this works with any agent.
- **Unread dots.** Left of every tab: a ring for the tab you are viewing, green for a file changed
  since you last viewed it, grey otherwise. Hidden tabs are watched too.
- **Show in Finder.** Reveals the current file in the daemon machine's file manager.
- **Explicit opens.** `/md <path>` in the composer, an **Open markdown viewer** Command Center item,
  and a `bin/open-markdown <path>` script agents can run to show you a file.

## Install

Enable trusted plugins on the daemon, then:

```bash
paseo plugin add opsb/paseo-markdown-viewer
paseo plugin ls
```

Open a workspace, press **⌘K**, and choose **Open markdown viewer**, or type `/md README.md` in the
composer.

## Using the panel

| Action | How |
| --- | --- |
| Open a file | Type a path in the toolbar and press return. Relative paths resolve against the workspace; absolute and `~/` paths are accepted as typed. |
| Open from the composer | `/md docs/plan.md` opens a tab and brings the panel forward. No prompt is sent to the agent. |
| Switch or close tabs | Tap a tab; tap its `×` to close. Closing the active tab moves to its neighbour. |
| Reveal on disk | **Show in Finder** in the document footer. |

### Follow mode

Two switches in the toolbar, shared by every client of the daemon:

| Switch | Default | Effect |
| --- | --- | --- |
| **Follow agents** | on | Files an agent writes or edits open as background tabs with an unread dot. |
| **Bring forward** | off | Followed files also raise the panel itself. |

### Letting an agent open a file

From inside a Paseo agent, where `PASEO_AGENT_ID` is set:

```bash
<plugin-directory>/bin/open-markdown docs/decision.md
```

The script drops a small JSON request into `$PASEO_HOME/plugin-data/paseo-markdown-viewer/inbox/`.
The daemon turns it into a row in that agent's conversation, and the row opens the tab and brings
the panel forward. No network port is opened.

## How it works

- Files are read by the daemon over plugin RPC. Relative paths are confined to the workspace
  directory, following symlinks, and only `.md`, `.markdown` and `.mdx` files up to 2 MB are served.
- Change detection is a daemon-side directory watcher plus a content hash, surfaced to the panel as
  a long poll that resolves the instant the content differs. Paseo has no daemon-to-app push
  channel for plugins, and the long poll rides Paseo's own connection, so it works through the relay
  and on mobile.
- Follow mode subscribes to every live agent's timeline on the daemon and appends one plugin-owned
  row per agent when a markdown write or edit completes. The row's renderer opens the tab.

## Limitations

- Follow mode acts when the requesting agent's conversation is on screen, which it is when you are
  working with that agent. A hidden conversation opens its tabs when next viewed.
- Files an agent writes through a shell heredoc appear as shell commands, not edits, and are not
  followed. Use `bin/open-markdown` for those.
- **Show in Finder** reveals the file on macOS. Other platforms open the containing folder.
- Follow-mode settings are stored through Paseo's settings API. The 0.8.0 SDK gives the daemon no
  handle to read them, so the daemon reads the persisted document directly.

## Development

```bash
npm install
npm run typecheck
paseo plugin install /absolute/path/to/paseo-markdown-viewer
paseo plugin reload paseo-markdown-viewer
paseo plugin logs paseo-markdown-viewer
```

Layout follows the Paseo plugin contract: `index.client.tsx` and `client/` run in the app,
`index.server.ts` and `server/` run in the daemon subprocess, `shared/` holds the Zod contracts.

## License

MIT
