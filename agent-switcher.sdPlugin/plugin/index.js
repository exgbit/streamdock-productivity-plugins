const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

const startup = parseStartupArgs(process.argv);
const ws = new WebSocket(`ws://127.0.0.1:${startup.port}`);
const contexts = new Map();
const logDir = path.join(__dirname, 'log');
const eventLog = path.join(logDir, 'events.ndjson');
let sessions = [];
let refreshTimer = null;
const activityBySession = new Map();
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
  refreshTimer = setInterval(refreshNow, 2000);
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
    const session = sessions[slot];
    if (!session) {
      setTitle(context, 'No\nAgent');
      return;
    }
    const result = await switchToSession(session);
    setTitle(context, result === 'not-found' ? `${session.shortName}\n${session.tty}` : `${session.shortName}\nOpen`);
    return;
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
    sessions = await listAgentSessions();
    updateAllSlots();
  } catch (error) {
    appendEventLog({ event: 'refreshError', message: error.message });
  }
}

function updateAllSlots() {
  const ordered = orderedContexts();
  for (const slotContext of ordered) {
    const { context, slotIndex } = slotContext;
    if (!Number.isInteger(slotIndex)) {
      setTitle(context, 'Loading');
      setImage(context, iconSvgData({ project: 'Loading', detail: '', agent: '', themeColor: '#3b3b3b', statusColor: '#59636e' }));
      continue;
    }
    const session = sessions[slotIndex];
    if (!session) {
      setTitle(context, `Slot ${slotIndex + 1}\nempty`);
      setImage(context, iconSvgData({ project: 'EMPTY', detail: `slot ${slotIndex + 1}`, agent: '', themeColor: '#3b3b3b', statusColor: '#59636e' }));
      continue;
    }

    setTitle(context, session.shortName);
    setImage(context, iconSvgData({
      project: session.projectTitle,
      detail: session.subtitle,
      agent: `${session.shortName} ${session.statusLabel}`,
      themeColor: themeColorForSession(session),
      statusColor: statusColorForSession(session)
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

function listAgentSessions() {
  return new Promise((resolve, reject) => {
    execFile('/bin/ps', ['-axo', 'pid=,ppid=,stat=,tt=,%cpu=,command='], { timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      enrichSessions(parseAgentSessions(stdout)).then((items) => mergeWatchedSessions(items).then(resolve, reject), reject);
    });
  });
}

function parseAgentSessions(stdout) {
  const grouped = new Map();
  const shellsByTty = new Map();
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+([\d.]+)\s+(.+)$/);
    if (!match) continue;

    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const stat = match[3];
    const tty = match[4];
    const cpu = Number(match[5]);
    const command = match[6];
    if (tty === '??') continue;

    if (detectShellKind(command)) {
      const shell = {
        pid,
        ppid,
        stat,
        tty,
        command,
        score: shellScore(command, { ppid, stat })
      };
      const previousShell = shellsByTty.get(tty);
      if (!previousShell || shell.score > previousShell.score || (shell.score === previousShell.score && shell.pid > previousShell.pid)) {
        shellsByTty.set(tty, shell);
      }
    }

    const kind = detectAgentKind(command);
    if (!kind) continue;

    const key = tty;
    const candidate = {
      kind,
      pid,
      ppid,
      stat,
      cpu,
      tty,
      deviceTty: tty.startsWith('tty') ? `/dev/${tty}` : `/dev/tty${tty}`,
      command,
      shortName: kind === 'codex' ? 'Codex' : 'Claude',
      projectTitle: '',
      subtitle: tty,
      cwd: '',
      shellPid: shellsByTty.get(tty)?.pid || null,
      score: scoreProcess(kind, command, { ppid, stat })
    };

    const previous = grouped.get(key);
    if (!previous || candidate.score > previous.score || (candidate.score === previous.score && candidate.pid > previous.pid)) {
      grouped.set(key, candidate);
    }
  }

  const sessions = Array.from(grouped.values()).map((session) => ({
    ...session,
    shellPid: shellsByTty.get(session.tty)?.pid || session.shellPid || null
  }));

  return sessions.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'codex' ? -1 : 1;
    return left.tty.localeCompare(right.tty, undefined, { numeric: true });
  });
}

async function enrichSessions(rawSessions) {
  const enriched = await Promise.all(rawSessions.map(async (session) => {
    const shellCwd = session.shellPid ? await getProcessCwd(session.shellPid) : '';
    const agentCwd = await getProcessCwd(session.pid);
    const cwd = shellCwd || agentCwd;
    const projectTitle = titleFromCwd(cwd) || `${session.shortName} ${session.tty}`;
    return {
      ...session,
      cwd,
      shellCwd,
      agentCwd,
      projectTitle,
      subtitle: subtitleFromCwd(cwd, session.tty),
      ...activityStateFor(session)
    };
  }));

  return enriched;
}

function activityStateFor(session) {
  const key = `${session.kind}:${session.tty}:${session.pid}`;
  const previous = activityBySession.get(key) || { quietSamples: 0 };
  const cpu = Number(session.cpu || 0);
  const isForeground = String(session.stat || '').includes('+');
  const isRunning = String(session.stat || '').includes('R');
  const isQuiet = isForeground && !isRunning && cpu <= 1.0;
  const quietSamples = isQuiet ? previous.quietSamples + 1 : 0;

  activityBySession.set(key, { quietSamples, lastSeen: Date.now() });
  pruneActivityState();

  const waiting = quietSamples >= 3;
  return {
    waiting,
    statusLabel: waiting ? 'WAIT' : 'RUN'
  };
}

function pruneActivityState() {
  const cutoff = Date.now() - 30000;
  for (const [key, state] of activityBySession.entries()) {
    if (state.lastSeen < cutoff) {
      activityBySession.delete(key);
    }
  }
}

function getProcessCwd(pid) {
  return new Promise((resolve) => {
    execFile('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeout: 1000 }, (error, stdout) => {
      if (error) {
        resolve('');
        return;
      }

      const cwdLine = stdout.split('\n').find((line) => line.startsWith('n/'));
      resolve(cwdLine ? cwdLine.slice(1) : '');
    });
  });
}

function titleFromCwd(cwd) {
  if (!cwd) return '';
  return path.basename(cwd) || cwd;
}

function subtitleFromCwd(cwd, tty) {
  if (!cwd) return tty;
  const parent = path.basename(path.dirname(cwd));
  return parent ? `${parent} / ${tty}` : tty;
}

async function mergeWatchedSessions(items) {
  const watched = await readWatchedSessions();
  if (!watched.length) return items;

  const byTty = new Map(items.map((item) => [item.tty, item]));
  for (const watchedSession of watched) {
    const existing = byTty.get(watchedSession.tty);
    if (existing && ['DONE', 'ERR'].includes(watchedSession.statusLabel)) {
      continue;
    }
    byTty.set(watchedSession.tty, {
      ...(existing || {}),
      ...watchedSession,
      deviceTty: existing?.deviceTty || watchedSession.deviceTty,
      score: existing?.score || 0
    });
  }

  return Array.from(byTty.values()).sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'codex' ? -1 : 1;
    return left.tty.localeCompare(right.tty, undefined, { numeric: true });
  });
}

function readWatchedSessions() {
  const dir = path.join(osHome(), '.agent-watch', 'sessions');
  return fs.promises.readdir(dir)
    .catch(() => [])
    .then((files) => Promise.all(files.filter((file) => file.endsWith('.json')).map((file) => readWatchedSession(path.join(dir, file)))))
    .then((items) => items.filter(Boolean));
}

function readWatchedSession(filePath) {
  return fs.promises.readFile(filePath, 'utf8')
    .then((raw) => {
      const data = JSON.parse(raw);
      if (!data.tty || !data.agent || !data.project) return null;
      if (Date.now() - Number(data.updatedAt || 0) * 1000 > 12 * 60 * 60 * 1000) return null;
      const kind = data.agent === 'codex' ? 'codex' : 'claude';
      return {
        kind,
        pid: Number(data.pid || 0),
        ppid: 0,
        stat: '',
        cpu: 0,
        tty: data.tty,
        deviceTty: data.tty.startsWith('tty') ? `/dev/${data.tty}` : `/dev/tty${data.tty}`,
        command: Array.isArray(data.command) ? data.command.join(' ') : '',
        shortName: kind === 'codex' ? 'Codex' : 'Claude',
        projectTitle: data.project,
        subtitle: data.parent ? `${data.parent} / ${data.tty}` : data.tty,
        cwd: data.cwd || '',
        statusLabel: watchedStatusLabel(data.state),
        watchedState: data.state,
        waiting: data.state === 'waiting',
        watched: true
      };
    })
    .catch(() => null);
}

function watchedStatusLabel(state) {
  if (state === 'waiting') return 'WAIT';
  if (state === 'done') return 'DONE';
  if (state === 'error') return 'ERR';
  return 'RUN';
}

function osHome() {
  return process.env.HOME || process.env.USERPROFILE || '';
}

function themeColorForSession(session) {
  return session.kind === 'codex' ? '#0f8cff' : '#d97706';
}

function statusColorForSession(session) {
  if (session.statusLabel === 'WAIT') return '#f2b84b';
  if (session.statusLabel === 'DONE') return '#59636e';
  if (session.statusLabel === 'ERR') return '#c53030';
  if (session.statusLabel === 'RUN') return '#2f855a';
  return '#59636e';
}

function detectAgentKind(command) {
  const lower = command.toLowerCase();
  if (/(^|\/|\s)claude(\s|$)/.test(lower)) return 'claude';
  if (/(^|\/|\s)codex(\s|$)/.test(lower) || lower.includes('/@openai/codex/')) return 'codex';
  return null;
}

function detectShellKind(command) {
  const lower = String(command || '').toLowerCase();
  if (/(^|\/|\s|-)(zsh|bash|fish|sh)(\s|$)/.test(lower)) return 'shell';
  return null;
}

function shellScore(command, { ppid, stat }) {
  let score = 0;
  const text = String(command || '');
  if (String(stat || '').includes('+')) score += 20;
  if (ppid !== 1) score += 10;
  if (text.startsWith('-')) score += 30;
  if (/(^|\/)(zsh|bash|fish|sh)(\s|$)/i.test(text)) score += 20;
  return score;
}

function scoreProcess(kind, command, { ppid, stat }) {
  const lower = command.toLowerCase();
  let score = 0;
  if (String(stat).includes('+')) score += 100;
  if (ppid !== 1) score += 30;
  if (ppid === 1) score -= 50;
  if (kind === 'claude' && /(^|\/|\s)claude(\s|$)/.test(lower)) score += 10;
  if (kind === 'codex' && lower.includes('/bin/codex')) score += 10;
  if (kind === 'codex' && lower.includes('/@openai/codex/')) score += 8;
  return score || 1;
}

async function switchToSession(session) {
  try {
    const result = await runAppleScript(switchScript(), [session.deviceTty]);
    return result.includes('not-found') ? 'not-found' : 'ok';
  } catch (error) {
    appendEventLog({ event: 'switchError', session, message: error.message });
    return 'not-found';
  }
}

function switchScript() {
  return `
on run argv
  set targetTty to item 1 of argv

  if application "Terminal" is running then
    tell application "Terminal"
      repeat with w in windows
        repeat with t in tabs of w
          try
            if tty of t is targetTty then
              set selected tab of w to t
              set index of w to 1
              activate
              return "terminal"
            end if
          end try
        end repeat
      end repeat
    end tell
  end if

  if application "iTerm2" is running then
    tell application "iTerm2"
      repeat with w in windows
        repeat with t in tabs of w
          repeat with s in sessions of t
            try
              if tty of s is targetTty then
                select t
                select s
                activate
                return "iterm"
              end if
            end try
          end repeat
        end repeat
      end repeat
    end tell
  end if

  return "not-found"
end run
`;
}

function runAppleScript(source, args) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', source, ...args], { timeout: 3000 }, (error, stdout, stderr) => {
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

function iconSvgData({ project, detail, agent, themeColor, statusColor }) {
  const projectLines = wrapText(project || '', 14, 3);
  const projectSize = projectLines.length > 2 ? 19 : projectLines.length > 1 ? 21 : fontSizeFor(projectLines[0] || '', 27, 14);
  const detailText = fitText(detail || '', 19);
  const agentText = fitText(agent || '', 12).toUpperCase();
  const projectY = projectLines.length > 2 ? [45, 65, 85] : projectLines.length > 1 ? [55, 78] : [67];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="18" fill="#111"/>
  <rect x="12" y="12" width="120" height="120" rx="16" fill="${themeColor}"/>
  <rect x="12" y="103" width="120" height="29" rx="16" fill="${statusColor}"/>
  <rect x="12" y="103" width="120" height="14" fill="${statusColor}"/>
  <rect x="20" y="22" width="104" height="69" rx="8" fill="#101010" opacity="0.86"/>
  ${projectLines.map((line, index) => `<text x="72" y="${projectY[index]}" font-family="Arial, sans-serif" font-size="${projectSize}" font-weight="800" fill="#fff" text-anchor="middle">${escapeXml(line)}</text>`).join('')}
  <text x="72" y="101" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#f3f3f3" opacity="0.95" text-anchor="middle">${escapeXml(detailText)}</text>
  <text x="72" y="124" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#fff" letter-spacing="0" text-anchor="middle">${escapeXml(agentText)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function wrapText(value, maxChars, maxLines) {
  const text = String(value || '').trim();
  if (!text) return [''];
  if (text.length <= maxChars) return [text];

  const separators = /[-_\s.]+/;
  const parts = text.split(separators).filter(Boolean);
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
  if (length <= 10) return 29;
  if (length <= 13) return 24;
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
