# Chrome Tab Switcher

Stream Dock prototype for monitoring Google Chrome tabs on macOS.

## How It Works

- Place `Chrome Tab Slot` on as many keys as you want.
- The plugin polls Google Chrome every 1.5 seconds through AppleScript.
- Slots are filled by Chrome window order, then tab order.
- Press a slot to activate that Chrome window and tab.
- It supports multiple pages through persistent slot indexes.

## Notes

- Stream Dock plugins cannot create physical key placements by themselves. Pre-place enough slots for your expected tab count.
- macOS may ask you to allow Stream Dock to control Google Chrome.
- If Chrome has many tabs, use a dedicated Stream Dock page for this plugin.
- If copied keys duplicate a stored slot index, the plugin repairs duplicate visible slots automatically.

## Debug

Raw SDK events and errors are written to:

```text
chrome-tab-switcher.sdPlugin/plugin/log/events.ndjson
```
