# 我给 Stream Dock 做了两个效率插件：AI 终端切换器和 Chrome 标签切换器

> 适合发布摘要：  
> 我最近给 Stream Dock N4 Pro 做了一组 macOS 效率插件：一个用来监控 Codex / Claude Code 终端会话，一个用来监控 Chrome 标签页。它们可以把终端任务和网页标签映射到实体按键上，显示项目名、运行状态、标签标题，并支持一键切换。

项目地址：

https://github.com/exgbit/streamdock-productivity-plugins

## 背景

最近我在 Mac 上同时跑多个 AI 编程任务：有些终端里是 Codex，有些终端里是 Claude Code。实际使用时很快遇到一个问题：任务多了以后，光靠 Terminal 窗口和 Chrome 标签页已经很难判断当前哪个任务在跑、哪个任务在等我输入、哪个项目对应哪个终端。

我手上有一个 Stream Dock N4 Pro，它有 10 个按键、4 个旋钮和一条 touch bar。这个设备本来就很适合做「工作流面板」。于是我做了两个插件：

- **AI 终端切换器**：监控 Codex / Claude Code 终端会话。
- **Chrome 标签切换器**：监控 Chrome 标签页。

目标很简单：把正在处理的终端和网页，直接变成 Stream Dock 上可以看、可以按、可以切换的实体按键。

## 实际效果

### AI 终端切换器

![AI 终端切换器实拍效果](images/agent-switcher-device.png)

每个按键代表一个 AI 终端会话。图标中间显示项目名，比如 `jiagou`、`ainews`、`spapi`。下方小字显示父目录和 TTY 信息。

图标分成两个区域：

- 上半部分表示 Agent 类型：
  - Codex：蓝色
  - Claude：亚麻/橙色
- 下方状态条表示任务状态：
  - `RUN`：绿色，正在运行
  - `WAIT`：黄色，等待输入、选择或确认
  - `DONE`：灰色，任务完成
  - `ERR`：红色，异常退出

按下对应按键时，插件会尝试切换到对应的 Terminal / iTerm2 标签页。

### Chrome 标签切换器

![Chrome 标签切换器实拍效果](images/chrome-tab-switcher-device.png)

每个按键代表一个 Chrome 标签页。按键上会显示标签页标题、域名和标签序号。当前激活的标签页会用绿色强调。

按下按键时，会切换到对应的 Chrome 窗口和标签页。

## 为什么要做成两个插件

我一开始只是想解决「AI 终端太多」的问题。但真实工作里，终端和浏览器总是一起出现：

- 一个终端跑 Codex 修改代码。
- 一个终端跑 Claude Code 分析问题。
- Chrome 里开着 GitHub、Grafana、文档、YouTube、内部后台。
- 多个项目并行处理时，经常要在终端和网页之间来回切。

所以我把这个需求拆成两个独立插件：

- 终端会话归 **AI 终端切换器** 管。
- 浏览器标签归 **Chrome 标签切换器** 管。

这样每个插件职责清晰，也方便在 Stream Dock 上单独放页面。例如第一页放 AI 终端，第二页放 Chrome 标签。

## 插件一：AI 终端切换器

### 中文名

**AI 终端切换器**

### 对应 action

**AI 终端槽位**

### 功能

AI 终端切换器会定时扫描本机正在运行的 Codex 和 Claude Code 进程，并按 TTY 去重。一个终端只显示一个会话，避免同一个终端里残留旧进程时重复显示。

它会尽量识别：

- Agent 类型：Codex / Claude
- 项目目录名
- 父目录
- TTY
- 运行状态
- 对应的 Terminal / iTerm2 会话

### 显示设计

我把图标设计成「类型 + 状态」两层：

- 上半部分用来识别 Agent 类型。
- 下半部分用来识别状态。

这样不用读小字，也能大概知道哪个会话是什么状态。

例如：

- 蓝色 + 绿色：Codex 正在运行
- 蓝色 + 黄色：Codex 正在等待输入
- 亚麻色 + 黄色：Claude 正在等待输入
- 亚麻色 + 红色：Claude 异常退出

### RUN / WAIT 怎么判断

直接靠 CPU 判断不够可靠，所以我做了一个可选 wrapper：`agent-watch`。

使用方式：

```bash
agent-watch claude
agent-watch codex resume
```

它会通过伪终端启动 Codex / Claude，并把状态写到：

```text
~/.agent-watch/sessions/
```

Agent Switcher 会优先读取这些状态文件。

状态包括：

- `RUN`：仍在运行或持续输出
- `WAIT`：输出停止，并且看起来正在等待用户输入
- `DONE`：进程正常结束
- `ERR`：进程异常退出

如果没有通过 `agent-watch` 启动，插件仍然会用进程信息做基础识别，只是状态准确度会低一些。

### 多页面支持

Stream Dock 插件不能自己创建物理按键。也就是说，插件不能自动新增第 11 个、第 12 个、第 13 个按键。

解决方式是：你手动放置多个「AI 终端槽位」。插件会给每个按键分配一个持久槽位编号：

- 第 1 页：slot 1 到 slot 10
- 第 2 页：slot 11 到 slot 20
- 第 3 页：继续往后

如果你复制了一个已有按键，Stream Dock 可能会把槽位编号也复制过去。插件会检测当前可见页面里的重复槽位，并自动修复。

## 插件二：Chrome 标签切换器

### 中文名

**Chrome 标签切换器**

### 对应 action

**Chrome 标签槽位**

### 功能

Chrome 标签切换器会通过 AppleScript 定时读取 Google Chrome 的窗口和标签页。它按窗口顺序、标签页顺序，把 Chrome 标签映射到 Stream Dock 按键上。

每个按键显示：

- 标签页标题
- 域名
- 标签序号
- 是否为当前激活标签页

按下按键时，插件会激活对应的 Chrome 窗口和标签页。

### 适合的场景

这个插件特别适合这些情况：

- 同时打开很多技术文档
- 同时看 GitHub、Grafana、后台、日报系统
- 一边用 AI 写代码，一边在浏览器查资料
- 需要在多个固定网页之间频繁切换

### 多页面支持

Chrome 标签页很多时，同样可以放到多个 Stream Dock 页面上。

例如：

- 第 1 页显示前 10 个 Chrome 标签
- 第 2 页显示第 11 到第 20 个 Chrome 标签
- 第 3 页继续往后

需要注意的是，Chrome 的 AppleScript API 没有提供真正稳定的永久 tab ID。所以如果你关闭或移动标签页，后面的槽位会自然前移。

## 安装方式

从 GitHub 克隆项目：

```bash
git clone https://github.com/exgbit/streamdock-productivity-plugins.git
cd streamdock-productivity-plugins
```

安装两个插件：

```bash
rsync -av agent-switcher.sdPlugin "$HOME/Library/Application Support/HotSpot/StreamDock/plugins/"
rsync -av chrome-tab-switcher.sdPlugin "$HOME/Library/Application Support/HotSpot/StreamDock/plugins/"
```

安装可选 wrapper：

```bash
mkdir -p "$HOME/.local/bin"
rsync -av scripts/agent-watch "$HOME/.local/bin/agent-watch"
```

安装完成后重启 Stream Dock。

## 使用方式

### 使用 AI 终端切换器

1. 重启 Stream Dock。
2. 在插件列表中找到「AI 终端切换器」。
3. 把「AI 终端槽位」拖到多个按键上。
4. 打开 Codex 或 Claude Code 终端会话。
5. 按键会自动显示对应项目和状态。
6. 点击按键即可切换到对应终端。

如果希望状态更准确，可以这样启动：

```bash
cd /path/to/your/project
agent-watch claude
```

或者：

```bash
cd /path/to/your/project
agent-watch codex resume
```

### 使用 Chrome 标签切换器

1. 重启 Stream Dock。
2. 在插件列表中找到「Chrome 标签切换器」。
3. 把「Chrome 标签槽位」拖到多个按键上。
4. 打开 Google Chrome。
5. 按键会自动显示当前 Chrome 标签页。
6. 点击按键即可切换到对应标签页。

## 权限说明

macOS 可能会弹出自动化权限提示。需要允许 Stream Dock 控制：

- Terminal
- iTerm2
- Google Chrome

这些权限用于切换窗口和标签页。

## 当前限制

### 1. Stream Dock 不能自动生成实体按键

插件可以修改按键图标和标题，但不能自己创建物理按键位置。因此需要用户先手动放置足够多的槽位。

### 2. Chrome 标签没有永久 ID

Chrome AppleScript 能读取窗口和标签页顺序，但没有稳定的永久 tab ID。关闭或移动标签页后，槽位会按新顺序重新映射。

### 3. Warp / Cursor 内置终端切换不一定精确

Terminal 和 iTerm2 可以按 TTY 尝试切换。Warp、Cursor 内置终端如果没有公开的自动化 API，就只能检测进程，不能保证精确切回对应标签。

### 4. WAIT 状态建议用 agent-watch

只靠进程信息判断等待输入不够可靠。建议通过 `agent-watch` 启动新会话，插件会优先使用 wrapper 写出的结构化状态。

## 项目结构

```text
streamdock-productivity-plugins/
├── agent-switcher.sdPlugin/
├── chrome-tab-switcher.sdPlugin/
├── scripts/
│   └── agent-watch
├── docs/
│   └── images/
└── README.md
```

## 适合谁用

这个插件合集适合这些人：

- 同时运行多个 Codex / Claude Code 任务的开发者
- 经常在多个项目终端之间切换的人
- Chrome 标签页常年很多的人
- 想把 AI 编程工作流放到实体控制台上的人
- 使用 Stream Dock / MiraBox 设备管理工作流的人

## 总结

这个项目本质上是把「正在发生的工作」映射到 Stream Dock 的实体按键上。

以前我需要在 Terminal、Chrome、任务窗口之间来回找。现在只要看一眼 Stream Dock，就能知道：

- 哪个项目正在跑 Codex
- 哪个项目正在跑 Claude
- 哪个任务在等我输入
- 哪个 Chrome 标签页可以直接切过去

对多任务 AI 编程来说，这种实体化的状态面板非常直观。

项目地址：

https://github.com/exgbit/streamdock-productivity-plugins

