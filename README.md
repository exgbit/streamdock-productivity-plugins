# Stream Dock Productivity Plugins

macOS Stream Dock plugins for switching between AI agent terminals and Chrome tabs.

## Included

- `agent-switcher.sdPlugin`: monitors Codex and Claude Code terminal sessions, shows project names and RUN/WAIT state, and switches to the matching terminal.
- `chrome-tab-switcher.sdPlugin`: monitors Google Chrome tabs and switches to the selected tab.
- `scripts/agent-watch`: optional wrapper for launching Codex/Claude with more reliable RUN/WAIT/DONE/ERR state reporting.

## Install

```bash
rsync -av agent-switcher.sdPlugin "$HOME/Library/Application Support/HotSpot/StreamDock/plugins/"
rsync -av chrome-tab-switcher.sdPlugin "$HOME/Library/Application Support/HotSpot/StreamDock/plugins/"
mkdir -p "$HOME/.local/bin"
rsync -av scripts/agent-watch "$HOME/.local/bin/agent-watch"
```

Restart Stream Dock after installing or updating.

## Agent Switcher

Place multiple `Agent Slot` actions on Stream Dock keys. Each key stores a persistent slot index, so you can place more slots across multiple pages.

The icon is split into two visual areas:

- upper area: agent type color, Codex blue or Claude amber
- bottom strip: state color, RUN green, WAIT yellow, DONE gray, ERR red

The primary text is the project directory name. Pressing a key switches to the matching Terminal/iTerm session when possible.

For more reliable state detection, start new sessions through the wrapper:

```bash
agent-watch claude
agent-watch codex resume
```

The wrapper writes state files under:

```text
~/.agent-watch/sessions/
```

Agent Switcher reads those files when available.

## Chrome Tab Switcher

Place multiple `Chrome Tab Slot` actions on Stream Dock keys. The plugin polls Chrome through AppleScript and maps slots to Chrome tabs by window order, then tab order.

Pressing a key activates the matching Chrome window and tab.

## Notes

- Stream Dock plugins cannot create physical key placements by themselves. Place enough slot actions on one or more pages.
- If a copied key duplicates a stored slot index, the plugins repair duplicate visible slots automatically.
- macOS may prompt for Automation permissions to control Terminal, iTerm2, or Google Chrome.
