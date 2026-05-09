# CLAUDE.md

此文件为 Claude Code 在此仓库中工作提供指引。

## 项目概述

纯原生 HTML/CSS/JS 构建的移动端 PWA 备忘录，无框架、无构建工具、无后端。部署于 GitHub Pages。

## 开发方式

直接用浏览器打开 `index.html`，无需构建、无需安装依赖。

## 架构：三个平行模块

应用有三个独立的数据模块，各自遵循相同模式：

| 模块 | 存储 Key | 状态 | 列表渲染 | 弹窗 ID |
|------|---------|------|---------|--------|
| 备忘 | `memos_v1` | `state` | `renderList()` | `overlay` |
| 小记 | `notes_v1` | `noteState` | `renderNoteList()` | `noteOverlay` |
| 打卡 | `habits_v1` | `habitState` | `renderHabitList()` | `habitOverlay` |

每个模块各有：存储 key、状态对象、load/save 函数、过滤 getter、列表渲染器、卡片 HTML 生成器、滑动手势、弹窗（新建/编辑/保存/删除）、归档支持。

三个模块共用 `#memoList` DOM 元素渲染列表——`renderAll()` 根据 `state.currentTab` 决定渲染哪个模块。

## Tab 切换

底部导航：`备忘 | 小记 | 打卡 | 归档`

`renderAll()` 是中央调度器——检查 `state.currentTab` 后分发到对应渲染器。跨模块代码修改数据后始终调用 `renderAll()`，不要直接调用模块内部的渲染函数。

## 数据模型

**备忘** (`state.memos[]`)：`id, title, description, todos[], tags[], color, priority, archived, createdAt, updatedAt`
- `todos[]`：`id, text, done, indent, collapsed, dueTime`

**小记** (`noteState.notes[]`)：`id, title, content (HTML 字符串), tags[], pinned, pinnedAt, archived, createdAt, updatedAt`

**打卡** (`habitState.habits[]`)：`id, title, emoji, color, completedDates[] (YYYY-MM-DD 格式字符串), archived, createdAt, updatedAt`

## 关键模式

- **左滑操作**：每个模块有独立的滑动实现（`initSwipes`、`initNoteSwipes`、`initHabitSwipes`），遵循相同的 touch/mousedown 模式，阈值均为 `ACTION_W = 160`。
- **标签系统**：备忘和小记各有独立标签体系，标签栏支持长按拖拽排序（300ms 触发）。CSS 包含 `user-select: none` + `-webkit-touch-callout: none` + `touch-action: manipulation` 防止 Android 系统弹出上下文菜单。
- **小记展开/收起**：点击卡片调用 `toggleNoteExpand()`，展开显示完整 HTML 内容，收起显示纯文本预览。展开状态保存在 `expandedNoteIds` Set 中，切 tab 或切标签时自动清空。长按 500ms 进入编辑。
- **小记置顶**：左滑露出「置顶」按钮，调用 `pinNote()`。置顶小记在 `filteredNotes()` 中排在前面，多条按最新置顶时间 `pinnedAt` 倒序。
- **小记⋯编辑菜单**：每条小记卡片右上角有 `⋯` 按钮，点击弹出全局下拉菜单（`#noteCardMenu`），含「✏️ 编辑」选项，调用 `openEditNote()`。菜单按钮通过 stopPropagation 阻止触发展开/收起和长按编辑。全局只有一个 dropdown 实例（`initNotes()` 中创建），通过 `_openNoteCardMenu()` / `_closeNoteCardMenu()` 定位和显隐。`_bindNoteCardMenu()` 在每次 `renderNoteList()` 和 `renderArchiveAll()` 后调用。
- **归档**：三个模块共用归档页，顶部有子 tab（备忘/小记/打卡）。归档项标记 `archived: true`，非真删除。
- **弹窗**：底部弹出式，各模块各有独立 overlay + modal。小记弹窗已做紧凑化，标题和内容区域去掉了 field-label。
- **富文本编辑器**：小记模块使用 `contenteditable` div + 工具栏（加粗、下划线、颜色、base64 图片插入）。编辑器失焦时保存 Selection，工具栏按钮 mousedown 时恢复，避免焦点丢失导致 execCommand 失效。
- **FAB**：根据 `state.currentTab` 路由到对应的 `openNew*()` 函数。
- **通知**：待办到期时间通过 `setTimeout` 触发 Web Notification API（最长 24 小时）。每次 `save()` 调用时重建所有定时器。
- **导出/导入**：三个模块全量打包为一个 JSON（`{version, exportedAt, memos, notes, habits}`）。移动端走 Web Share API，桌面端下载兜底。文件导入和剪贴板导入均兼容旧格式（纯备忘数组）和新格式（全量备份）。
- **Service Worker**：Cache-first 策略。资源变更时需在 `sw.js` 中递增 `CACHE` 版本号。

## 标签栏行为

- 备忘和小记各有独立标签栏，通过 `renderTagsBar()` 和 `renderNoteTagsBar()` 渲染
- 两者共用 `#tagsBar` DOM 元素
- `renderAll()` 根据 `currentTab` 控制标签栏显隐
- 打卡和归档页面隐藏标签栏，同时设置 `--tags-bar-h` CSS 变量为 `0px` 使内容区上移