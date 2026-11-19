# src/AGENTS.md

适用范围：`src/` 服务端代码。需同时遵守根 `../AGENTS.md`；页面约定见 `../client/AGENTS.md`。

- `index.ts` 只声明配置、依赖并装配：`koishi` 必需；`agents`、`chatluna_webui`、`server`/`chatluna_server` 均为可选注入，缺少时对应能力不加载，指令仍可用。
- `library.ts` 的 `ImageLibrary` 是唯一读写图库的入口。所有修改经 `run()` 串行执行，结束后写回 `meta.json`（临时文件 + rename）并触发 `image-host.library` 状态刷新。修改以磁盘为准，`rescan()` 从目录重建，名称不合法或扩展名不支持的文件跳过而不改名。
- 去重以 SHA-256 为准，范围是单个分类：上传时跳过分类内已有内容；移动到其他分类时目标已有相同内容则拒绝；`dedupe()` 删除分类内重复项并保留最早的一张。同一图片允许出现在不同分类。
- 指令随机发图用每分类一个洗牌袋：一轮内每张只发一次，换轮时避免与上一张相同；上传、移动、重扫后重洗。状态只在内存中。Bot 自己从提示词列出的文件中挑选，不经过洗牌袋。
- `commands.ts` 用前置中间件匹配 `<前缀><分类>[/<文件>]`，因为分类可动态增删且可能含 `.`，不能注册为 Koishi 指令。分类不存在或与已注册指令同名时调用 `next()` 交还；文件名允许省略扩展名，大小写不敏感。
- 不注册自定义回复元素：Bot 用 v2 内置的 `<img src>` 发送本地图片。`prompt.ts` 在 `chatluna/agent-open` 时给每个 Agent 注册 id 为 `image-host` 的 context 区提示词块（插件加载前已打开的 Agent 通过 `ctx.agents.list()` 补上），模板中 `{dir}` 展开为图片根目录（统一正斜杠）、`{categories}` 展开为可见且有图的分类清单，渲染为空时不注入。注册表在 `chatluna/agent-close` 时移除对应项，插件卸载时撤回全部块。
- `webui.ts` 声明 `States`/`Actions` 线上契约。上传走 Base64 action，单批数量和体积由客户端控制、服务端按 `maxFileSize` 校验并识别文件头。图片预览走 `/image-host/files/:category/:file`，不在 `/api` 下以便 `<img>` 直接加载，必须先 `verifyCookie`，并 `exclude` 掉 SPA 回退。
- `types.ts` 与 `utils.ts` 不依赖 Node 内置模块，客户端直接导入；需要 Node 的逻辑（如哈希）放在 `library.ts`。
- 错误用 `@chatluna/protocol` 的 `ChatLunaError`（`validationError`、`notFound`、conflict），由宿主 handler 映射成对应 HTTP 状态。
