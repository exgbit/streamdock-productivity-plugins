# Agent Switcher

Stream Dock prototype for monitoring running Codex and Claude Code terminal sessions on macOS.

## How It Works

- Place `Agent Slot` on as many keys as you want.
- The plugin polls `ps` every 2 seconds.
- It deduplicates sessions by agent type and TTY.
- Slots are filled from left to right, top to bottom.
- Press a slot to switch to the matching Terminal or iTerm2 tab.
- It supports multiple pages through persistent slot indexes.
- It reads `~/.agent-watch/sessions/*.json` when available for more reliable RUN/WAIT/DONE/ERR state.

## Current Limits

- Stream Dock plugins cannot create physical key placements by themselves. You pre-place several `Agent Slot` actions, then the plugin changes their labels/images.
- Exact switching is implemented for Terminal and iTerm2 by matching the tab/session TTY.
- Warp, Cursor integrated terminals, and other terminal apps may be detected, but exact tab switching is not reliable unless they expose an AppleScript or URL API for selecting a TTY/session.
- If copied keys duplicate a stored slot index, the plugin repairs duplicate visible slots automatically.

## Optional Wrapper

Install:

```bash
mkdir -p "$HOME/.local/bin"
rsync -av scripts/agent-watch "$HOME/.local/bin/agent-watch"
```

Start new sessions:

```bash
agent-watch claude
agent-watch codex resume
```

The wrapper publishes state under `~/.agent-watch/sessions/`.

## Install

```bash
cd agent-switcher.sdPlugin/plugin
npm install
rsync -av ../ "$HOME/Library/Application Support/HotSpot/StreamDock/plugins/agent-switcher.sdPlugin/"
```

Restart Stream Dock after installation.

## Debug

Raw SDK events and scan errors are written to:

```text
agent-switcher.sdPlugin/plugin/log/events.ndjson
```
