const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

const startup = parseStartupArgs(process.argv);
const ws = new WebSocket(`ws://127.0.0.1:${startup.port}`);
const contexts = new Map();
const logDir = path.join(__dirname, 'log');
const eventLog = path.join(logDir, 'events.ndjson');
let tabs = [];
let refreshTimer = null;
const pluginState = {
  nextSlotIndex: 0,
  globalSettingsLoaded: false
};

appendEventLog({ event: 'pluginProcessStarted', argv: process.argv.slice(2), startup });

ws.on('open', () => {
  appendEventLog({ event: 'websocketOpen' });
  send({ uuid: startup.pluginUuid, event: startup.registerEvent });
  getGlobalSettings();
  refreshNow();
  refreshTimer = setInterval(refreshNow, 1500);
});

ws.on('message', async (raw) => {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return;
  }

  appendEventLog(message);
  const { context, event, payload = {} } = message;

  if (event === 'didReceiveGlobalSettings') {
    applyGlobalSettings(payload.settings || {});
    assignPendingSlots();
    repairDuplicateVisibleSlots();
    await refreshNow();
    return;
  }

  if (event === 'willAppear') {
    const settings = payload.settings || {};
    const slotIndex = ensureSlotIndex(context, settings);
    contexts.set(context, {
      context,
      slotIndex,
      coordinates: payload.coordinates || { row: 0, column: contexts.size },
      settings: { ...settings, slotIndex }
    });
    repairDuplicateVisibleSlots();
    await refreshNow();
    return;
  }

  if (event === 'willDisappear') {
    contexts.delete(context);
    await refreshNow();
    return;
  }

  if (event === 'keyUp') {
    const item = contexts.get(context);
    const slot = item ? item.slotIndex : slotIndexForContext(context);
    if (!Number.isInteger(slot)) {
      setTitle(context, 'Loading');
      return;
    }
    const tab = tabs[slot];
    if (!tab) {
      setTitle(context, 'No\nTab');
      return;
    }
    const result = await activateChromeTab(tab);
    setTitle(context, result === 'ok' ? 'Open' : 'Not\nFound');
    setTimeout(updateAllSlots, 500);
  }
});

ws.on('error', (error) => appendEventLog({ event: 'websocketError', message: error.message }));
ws.on('close', () => {
  appendEventLog({ event: 'websocketClose' });
  if (refreshTimer) clearInterval(refreshTimer);
  process.exit(0);
});

async function refreshNow() {
  try {
    tabs = await listChromeTabs();
    updateAllSlots();
  } catch (error) {
    appendEventLog({ event: 'refreshError', message: error.message });
    tabs = [];
    updateAllSlots();
  }
}

function updateAllSlots() {
  const ordered = orderedContexts();
  for (const slotContext of ordered) {
    const { context, slotIndex } = slotContext;
    if (!Number.isInteger(slotIndex)) {
      setTitle(context, 'Loading');
      setImage(context, iconSvgData({
        title: 'Loading',
        detail: '',
        badge: 'CHROME',
        color: '#3b3b3b',
        active: false
      }));
      continue;
    }
    const tab = tabs[slotIndex];

    if (!tab) {
      setTitle(context, `Slot ${slotIndex + 1}\nempty`);
      setImage(context, iconSvgData({
        title: 'EMPTY',
        detail: `slot ${slotIndex + 1}`,
        badge: 'CHROME',
        color: '#3b3b3b',
        active: false
      }));
      continue;
    }

    setTitle(context, tab.active ? 'Active' : 'Chrome');
    setImage(context, iconSvgData({
      title: tab.displayTitle,
      detail: tab.domain || tab.shortUrl,
      badge: tab.active ? 'ACTIVE' : `TAB ${slotIndex + 1}`,
      color: tab.active ? '#2f855a' : '#1f6feb',
      active: tab.active
    }));
  }
}

function orderedContexts() {
  return Array.from(contexts.values()).sort((left, right) => {
    const l = left.coordinates || {};
    const r = right.coordinates || {};
    return Number(l.row || 0) - Number(r.row || 0) || Number(l.column || 0) - Number(r.column || 0);
  });
}

function slotIndexForContext(context) {
  return orderedContexts().findIndex((item) => item.context === context);
}

function listChromeTabs() {
  const source = `
if application "Google Chrome" is not running then
  return "[]"
end if

set jsonItems to {}
tell application "Google Chrome"
  repeat with windowIndex from 1 to count of windows
    set w to window windowIndex
    set activeTabIndex to active tab index of w
    repeat with tabIndex from 1 to count of tabs of w
      set t to tab tabIndex of w
      set tabTitle to title of t
      set tabUrl to URL of t
      set isActive to ((windowIndex is 1) and (tabIndex is activeTabIndex))
      set end of jsonItems to "{\\"windowIndex\\":" & windowIndex & ",\\"tabIndex\\":" & tabIndex & ",\\"active\\":" & my boolJson(isActive) & ",\\"title\\":" & my quotedJson(tabTitle) & ",\\"url\\":" & my quotedJson(tabUrl) & "}"
    end repeat
  end repeat
end tell

return "[" & joinList(jsonItems, ",") & "]"

on boolJson(value)
  if value then return "true"
  return "false"
end boolJson

on quotedJson(value)
  set textValue to value as text
  set textValue to replaceText("\\\\", "\\\\\\\\", textValue)
  set textValue to replaceText("\\"", "\\\\\\"", textValue)
  set textValue to replaceText(return, "\\\\n", textValue)
  set textValue to replaceText(linefeed, "\\\\n", textValue)
  return "\\"" & textValue & "\\""
end quotedJson

on replaceText(findText, replaceWith, sourceText)
  set oldDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to findText
  set textItems to text items of sourceText
  set AppleScript's text item delimiters to replaceWith
  set newText to textItems as text
  set AppleScript's text item delimiters to oldDelimiters
  return newText
end replaceText

on joinList(itemsList, delimiter)
  set oldDelimiters to AppleScript's text item delimiters
  set AppleScript's text item delimiters to delimiter
  set joinedText to itemsList as text
  set AppleScript's text item delimiters to oldDelimiters
  return joinedText
end joinList
`;

  return runAppleScript(source, []).then((stdout) => {
    const parsed = JSON.parse(stdout || '[]');
    return parsed.map((tab) => normalizeTab(tab));
  });
}

function normalizeTab(tab) {
  const url = String(tab.url || '');
  const title = cleanChromeTitle(tab.title || '') || domainFromUrl(url) || 'New Tab';
  return {
    ...tab,
    displayTitle: title,
    domain: domainFromUrl(url),
    shortUrl: shortenUrl(url)
  };
}

function cleanChromeTitle(title) {
  return String(title || '')
    .replace(/\s+-\s+Google Chrome$/i, '')
    .replace(/\s+-\s+YouTube$/i, '')
    .trim();
}

function domainFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function shortenUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return String(url).slice(0, 28);
  }
}

function activateChromeTab(tab) {
  const source = `
on run argv
  set targetWindow to (item 1 of argv) as integer
  set targetTab to (item 2 of argv) as integer
  if application "Google Chrome" is not running then return "not-running"

  tell application "Google Chrome"
    if targetWindow > (count of windows) then return "not-found"
    set w to window targetWindow
    if targetTab > (count of tabs of w) then return "not-found"
    set active tab index of w to targetTab
    set index of w to 1
    activate
  end tell
  return "ok"
end run
`;
  return runAppleScript(source, [String(tab.windowIndex), String(tab.tabIndex)])
    .then((stdout) => (stdout.includes('ok') ? 'ok' : 'not-found'))
    .catch((error) => {
      appendEventLog({ event: 'activateError', tab, message: error.message });
      return 'not-found';
    });
}

function runAppleScript(source, args) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', source, ...args], { timeout: 4000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function send(message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function setTitle(context, title) {
  send({ event: 'setTitle', context, payload: { target: 0, title } });
}

function setImage(context, image) {
  send({ event: 'setImage', context, payload: { target: 0, image } });
}

function getGlobalSettings() {
  send({ event: 'getGlobalSettings', context: startup.pluginUuid });
}

function setGlobalSettings(payload) {
  send({ event: 'setGlobalSettings', context: startup.pluginUuid, payload });
}

function setSettings(context, payload) {
  send({ event: 'setSettings', context, payload });
}

function applyGlobalSettings(settings) {
  const nextSlotIndex = Number(settings.nextSlotIndex);
  if (Number.isInteger(nextSlotIndex) && nextSlotIndex >= 0) {
    pluginState.nextSlotIndex = Math.max(pluginState.nextSlotIndex, nextSlotIndex);
  }
  pluginState.globalSettingsLoaded = true;
}

function ensureSlotIndex(context, settings) {
  const existing = Number(settings.slotIndex);
  if (Number.isInteger(existing) && existing >= 0) {
    pluginState.nextSlotIndex = Math.max(pluginState.nextSlotIndex, existing + 1);
    setGlobalSettings({ nextSlotIndex: pluginState.nextSlotIndex });
    return existing;
  }

  if (!pluginState.globalSettingsLoaded) {
    return null;
  }

  const slotIndex = pluginState.nextSlotIndex;
  pluginState.nextSlotIndex += 1;
  setSettings(context, { ...settings, slotIndex });
  setGlobalSettings({ nextSlotIndex: pluginState.nextSlotIndex });
  appendEventLog({ event: 'slotAssigned', context, slotIndex });
  return slotIndex;
}

function assignPendingSlots() {
  for (const item of contexts.values()) {
    if (Number.isInteger(item.slotIndex)) continue;
    const slotIndex = ensureSlotIndex(item.context, item.settings || {});
    item.slotIndex = slotIndex;
    item.settings = { ...(item.settings || {}), slotIndex };
  }
}

function repairDuplicateVisibleSlots() {
  if (!pluginState.globalSettingsLoaded) return;

  const ordered = orderedContexts();
  const seen = new Set();
  const hasDuplicate = ordered.some((item) => {
    if (!Number.isInteger(item.slotIndex)) return false;
    if (seen.has(item.slotIndex)) return true;
    seen.add(item.slotIndex);
    return false;
  });
  if (!hasDuplicate) return;

  ordered.forEach((item, index) => {
    item.slotIndex = index;
    item.settings = { ...(item.settings || {}), slotIndex: index };
    setSettings(item.context, item.settings);
  });

  pluginState.nextSlotIndex = Math.max(pluginState.nextSlotIndex, ordered.length);
  setGlobalSettings({ nextSlotIndex: pluginState.nextSlotIndex });
  appendEventLog({ event: 'duplicateSlotsRepaired', count: ordered.length });
}

function iconSvgData({ title, detail, badge, color, active }) {
  const titleLines = wrapText(title || '', 14, 3);
  const titleSize = titleLines.length > 2 ? 18 : titleLines.length > 1 ? 20 : fontSizeFor(titleLines[0] || '', 26, 13);
  const titleY = titleLines.length > 2 ? [47, 68, 89] : titleLines.length > 1 ? [57, 80] : [70];
  const detailText = fitText(detail || '', 19);
  const badgeText = fitText(badge || '', 12).toUpperCase();
  const activeRing = active ? '<rect x="8" y="8" width="128" height="128" rx="20" fill="none" stroke="#7ee787" stroke-width="5"/>' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="18" fill="#111"/>
  <rect x="12" y="12" width="120" height="120" rx="16" fill="${color}"/>
  ${activeRing}
  <circle cx="34" cy="32" r="8" fill="#ff5f57"/>
  <circle cx="55" cy="32" r="8" fill="#ffbd2e"/>
  <circle cx="76" cy="32" r="8" fill="#28c840"/>
  <rect x="20" y="42" width="104" height="58" rx="8" fill="#101010" opacity="0.86"/>
  ${titleLines.map((line, index) => `<text x="72" y="${titleY[index]}" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="800" fill="#fff" text-anchor="middle">${escapeXml(line)}</text>`).join('')}
  <text x="72" y="115" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#f3f3f3" opacity="0.95" text-anchor="middle">${escapeXml(detailText)}</text>
  <text x="72" y="129" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#fff" letter-spacing="0" text-anchor="middle">${escapeXml(badgeText)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function wrapText(value, maxChars, maxLines) {
  const text = String(value || '').trim();
  if (!text) return [''];
  if (text.length <= maxChars) return [text];

  const parts = text.split(/[-_\s./|:]+/).filter(Boolean);
  if (parts.length > 1) {
    const lines = [];
    for (const part of parts) {
      const last = lines[lines.length - 1] || '';
      if (!last) {
        lines.push(part);
      } else if (`${last} ${part}`.length <= maxChars) {
        lines[lines.length - 1] = `${last} ${part}`;
      } else if (lines.length < maxLines) {
        lines.push(part);
      }
    }
    if (lines.length) return lines.slice(0, maxLines).map((line) => fitText(line, maxChars));
  }

  const lines = [];
  for (let offset = 0; offset < text.length && lines.length < maxLines; offset += maxChars) {
    lines.push(text.slice(offset, offset + maxChars));
  }
  return lines.map((line, index) => (index === maxLines - 1 && text.length > maxChars * maxLines ? fitText(line, maxChars) : line));
}

function fitText(value, maxChars) {
  const text = String(value || '').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function fontSizeFor(value, large, small) {
  const length = String(value || '').length;
  if (length <= 7) return large;
  if (length <= 10) return 23;
  if (length <= 13) return 19;
  return small;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appendEventLog(data) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(eventLog, JSON.stringify({ at: new Date().toISOString(), ...data }) + '\n');
  } catch {
    // Logging should not affect Stream Dock input handling.
  }
}

function parseStartupArgs(argv) {
  const byFlag = new Map();
  for (let index = 2; index < argv.length - 1; index += 1) {
    if (argv[index]?.startsWith('-')) {
      byFlag.set(argv[index].replace(/^-+/, ''), argv[index + 1]);
    }
  }

  return {
    port: byFlag.get('port') || byFlag.get('p') || argv[3] || argv[2],
    pluginUuid: byFlag.get('pluginUUID') || byFlag.get('pluginUuid') || byFlag.get('uuid') || argv[5] || argv[3],
    registerEvent: byFlag.get('registerEvent') || byFlag.get('event') || argv[7] || argv[4]
  };
}
