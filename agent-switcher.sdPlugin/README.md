# Agent Switcher

用于监控 macOS 上正在运行的 Codex 和 Claude Code 终端会话，并在 Stream Dock 按键上显示项目、状态和切换入口。

## 工作方式

- 在 Stream Dock 上放置多个 `Agent Slot`。
- 插件每 2 秒扫描一次进程。
- 按 TTY 去重，一个终端只显示一个会话。
- 按键会保存持久槽位编号，因此支持多个 Stream Dock 页面。
- 按下按键时，插件会尝试切换到对应的 Terminal 或 iTerm2 标签页。
- 如果存在 `~/.agent-watch/sessions/*.json` 状态文件，插件会优先读取它们来判断 `RUN / WAIT / DONE / ERR`。

## 图标含义

- 上半部分颜色表示 Agent 类型：
  - Codex：蓝色
  - Claude：亚麻/橙色
- 下方状态条表示状态：
  - `RUN`：绿色，正在运行或仍有活动
  - `WAIT`：黄色，正在等待你输入、选择或按回车
  - `DONE`：灰色，任务已结束
  - `ERR`：红色，任务异常退出

图标中间显示项目目录名，副标题显示父目录和 TTY。

## 可选 Wrapper

`agent-watch` 可以更可靠地识别 Agent 状态。它会通过伪终端启动 Codex / Claude，并写入结构化状态文件。

安装：

```bash
mkdir -p "$HOME/.local/bin"
rsync -av scripts/agent-watch "$HOME/.local/bin/agent-watch"
```

启动新会话：

```bash
agent-watch claude
agent-watch codex resume
```

状态文件位置：

```text
~/.agent-watch/sessions/
```

## 当前限制

- Stream Dock 插件不能自己创建物理按键，需要你提前放置多个 `Agent Slot`。
- Terminal 和 iTerm2 可以按 TTY 尝试精确切换。
- Warp、Cursor 内置终端等不一定支持精确切换，除非它们提供可按会话选择的自动化 API。
- 如果复制已有按键导致槽位编号重复，插件会自动修复当前可见页面中的重复编号。

## 调试

日志位置：

```text
agent-switcher.sdPlugin/plugin/log/events.ndjson
```
