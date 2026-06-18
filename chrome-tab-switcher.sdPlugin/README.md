# Chrome Tab Switcher

用于在 Stream Dock 上显示 Google Chrome 标签页，并点击切换到对应标签页。

## 工作方式

- 在 Stream Dock 上放置多个 `Chrome Tab Slot`。
- 插件每 1.5 秒通过 AppleScript 读取一次 Chrome 标签页。
- 槽位按 Chrome 窗口顺序、标签页顺序排列。
- 按键会保存持久槽位编号，因此支持多个 Stream Dock 页面。
- 按下按键时，会激活对应的 Chrome 窗口和标签页。

## 图标含义

- 中间显示标签页标题。
- 副标题显示域名或 URL 摘要。
- 当前激活的标签页会显示 `ACTIVE`，并使用绿色强调。
- 普通标签页显示 `TAB N`。

## 当前限制

- Stream Dock 插件不能自己创建物理按键，需要你提前放置足够多的 `Chrome Tab Slot`。
- Chrome 的 AppleScript API 没有稳定的永久 tab ID；如果你关闭或移动标签页，后面的槽位会自然前移。
- macOS 可能会提示允许 Stream Dock 控制 Google Chrome。
- 如果复制已有按键导致槽位编号重复，插件会自动修复当前可见页面中的重复编号。

## 调试

日志位置：

```text
chrome-tab-switcher.sdPlugin/plugin/log/events.ndjson
```
