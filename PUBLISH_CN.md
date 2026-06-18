# 官方发布文案

## 插件一：AI 终端切换器

英文标识：Agent Switcher

一句话简介：

实时监控 Codex 和 Claude Code 终端会话，在 Stream Dock 上显示项目名、运行状态，并一键切换到对应终端。

详细介绍：

AI 终端切换器适合同时运行多个 Codex、Claude Code 会话的开发者。插件会自动识别正在运行的 AI 终端，按项目目录显示在 Stream Dock 按键上，并用颜色区分 Codex 与 Claude。按键底部状态条会显示当前会话是正在运行、等待输入、已完成还是异常退出，方便快速判断哪个任务需要处理。

当你按下对应按键时，插件会尝试切换到匹配的 Terminal 或 iTerm2 标签页。你可以在多个 Stream Dock 页面中放置更多槽位，用于管理超过一页数量的终端会话。

核心功能：

- 自动识别 Codex 和 Claude Code 终端会话
- 显示项目目录名、父目录和 TTY 信息
- 用主题色区分 Codex / Claude
- 用底部状态条显示 RUN / WAIT / DONE / ERR
- 支持跨多个 Stream Dock 页面放置槽位
- 一键切换到对应 Terminal / iTerm2 会话
- 可选 `agent-watch` wrapper，提高等待输入状态识别准确度

推荐使用场景：

- 同时运行多个 AI 编程任务
- 需要快速查看哪个 Claude / Codex 正在等待输入
- 需要在多个项目终端之间快速切换
- 使用 Stream Dock 管理开发工作流

关键词：

AI、Codex、Claude Code、终端、Terminal、iTerm2、开发效率、任务监控、状态监控、Stream Dock

使用说明：

1. 安装插件后重启 Stream Dock。
2. 在设备上放置多个「AI 终端槽位」。
3. 打开 Codex 或 Claude Code 终端会话。
4. 按键会自动显示对应项目和状态。
5. 按下按键即可切换到对应终端。

可选增强：

```bash
agent-watch claude
agent-watch codex resume
```

通过 `agent-watch` 启动的新会话可以提供更可靠的 RUN / WAIT / DONE / ERR 状态。

## 插件二：Chrome 标签切换器

英文标识：Chrome Tab Switcher

一句话简介：

实时监控 Google Chrome 标签页，在 Stream Dock 上显示标签标题和域名，并一键切换到对应标签页。

详细介绍：

Chrome 标签切换器适合经常打开多个 Chrome 页面、需要快速切换网页的用户。插件会通过 AppleScript 读取当前 Chrome 的窗口和标签页，并将每个标签映射到 Stream Dock 按键上。按键上会显示标签页标题、域名和标签序号，当前激活的标签页会有明显状态提示。

你可以在一个或多个 Stream Dock 页面中放置多个「Chrome 标签槽位」。当 Chrome 标签页数量超过一页时，后续页面的槽位会继续对应后面的标签页。

核心功能：

- 自动读取 Google Chrome 窗口和标签页
- 显示标签页标题和域名
- 标记当前激活标签页
- 一键切换到对应 Chrome 窗口和标签页
- 支持跨多个 Stream Dock 页面放置槽位
- 自动修复复制按键导致的重复槽位编号

推荐使用场景：

- 同时打开多个网页资料、文档、控制台或视频页面
- 需要快速切换常用 Chrome 标签页
- 使用 Stream Dock 管理浏览器工作流
- 开发、运营、内容生产等多标签页场景

关键词：

Chrome、浏览器、标签页、网页切换、效率工具、工作流、Stream Dock、快捷切换

使用说明：

1. 安装插件后重启 Stream Dock。
2. 在设备上放置多个「Chrome 标签槽位」。
3. 打开 Google Chrome。
4. 按键会自动显示当前 Chrome 标签页。
5. 按下按键即可切换到对应标签页。

## 合集简介

Stream Dock 效率插件合集面向开发者和重度浏览器用户，提供 AI 终端会话管理和 Chrome 标签页切换能力。通过把终端任务、网页标签映射到实体按键，用户可以更快地理解当前工作状态，并在多个任务之间快速切换。
