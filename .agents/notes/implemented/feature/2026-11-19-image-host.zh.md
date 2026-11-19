# Agent Note: 图床插件

Status: implemented

## Problem

需要一个 ChatLuna v2 插件：在 WebUI 侧栏上传并分类管理图片，让 Bot 通过可见、可修改的提示词使用这些图片；聊天中 `/分类名` 随机发图、`/分类名/文件名` 发送指定图片；分类内图片去重，随机发送不重复。

## Decision

- 以磁盘为准：`images/<分类>/<文件>`，`meta.json` 只存描述、可见性、提示词模板和哈希缓存（`src/library.ts` 的 `ImageLibrary`）。修改串行执行，结束后原子写回元数据并刷新 `image-host.library` 状态。
- 不注册自定义回复元素，Bot 用 v2 内置的 `<img src>` 发送本地图片。`src/prompt.ts` 在 `chatluna/agent-open` 时给每个 Agent 注册 context 区提示词块 `image-host`（加载前已打开的 Agent 用 `ctx.agents.list()` 补上），模板中 `{dir}` 展开为图片根目录、`{categories}` 展开为可见分类及文件名，每轮渲染、变化才重发，渲染为空时不注入。默认模板只给图片目录和清单，不教 `<img>` 用法，v2 已注入内置元素说明。模板在侧栏页面编辑并预览。
- 指令用前置中间件（`src/commands.ts`）匹配原始文本，因为分类动态增删且可能含 `.`，无法注册为 Koishi 指令；分类不存在或与已注册指令同名时交还后续处理。
- 去重以 SHA-256 为准、范围是单个分类：上传跳过重复、跨分类移动拒绝重复、`dedupe()` 清理现存重复。随机发图用每分类一个洗牌袋，一轮内不重复、换轮不与上一张相同。
- 页面（`client/`）用 `ctx.slots.route` 注册 `/image-host/:category?`；上传走 Base64 action 并由客户端分批；预览走不在 `/api` 下、校验登录 Cookie 的 `/image-host/files/:category/:file`。
- `package.json` 的 `peerDependencies` 不声明 `koishi`，否则宿主按 Koishi 旧插件包装上下文，`ctx.server` 变为 Koa 外观。

## Alternatives considered

- 数据库表存索引：多一份需要与磁盘同步的状态，直接复制文件进目录的场景也更复杂。
- 为每个分类注册 Koishi 指令：`/` 与 `.` 会被拆成子指令，分类增删需要反复注册。
- LLM 工具发图：每张图多一次工具往返；`<img>` 可以直接内嵌在消息里。
- 自定义 `<image-host>` 回复元素：能隐藏磁盘路径并由插件随机取图，但与内置 `<img>` 功能重复，按要求不新增表达方式。

## Consequences

- 洗牌袋只在内存中，重启后重新开始一轮；只用于指令，Bot 自己挑选提示词中列出的文件。
- 提示词包含图片的绝对路径；Bot 读取需要 `fs:read` 权限，图片类文件不受工作区外限制。
- 同一张图片允许出现在不同分类中。
- 沙盒验收脚本 `scripts/verify-sandbox.mjs` 需要预先准备好对 Bot 可见、含 3 张大小不同图片的分类。
