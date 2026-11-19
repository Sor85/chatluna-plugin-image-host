# src/AGENTS.md

适用范围：`src/` 服务端代码。需同时遵守根 `../AGENTS.md`；页面约定见 `../client/AGENTS.md`。

- `index.ts` 只装配，插件没有配置项：设置全部在侧栏页面修改，`Config` 只导出带说明的空 `Schema.object({})`，因为插件管理页在没有 Schema 时会回退成原始 YAML 编辑器；存在 `meta.json` 的 `settings`（只存与 `utils.ts` 的 `DEFAULT_SETTINGS` 不同的项），数据目录固定为 `DATA_DIR`，因为设置本身就存在其中。读取设置的地方每次取 `library.settings`，保存后立即生效、无需重载插件。不依赖 `koishi`，`agents`、`chatluna_webui`、`server`/`chatluna_server` 均为可选注入；没有 `server` 时没有公开图片路由，提示词也不注入。
- `library.ts` 的 `ImageLibrary` 是唯一读写图库的入口。所有修改经 `run()` 串行执行，结束后写回 `meta.json`（临时文件 + rename）并触发 `image-host.library` 状态刷新。修改以磁盘为准，`rescan()` 从目录重建，名称不合法或扩展名不支持的文件跳过而不改名。
- 去重以 SHA-256 为准，范围是单个分类：上传时跳过分类内已有内容；移动到其他分类时目标已有相同内容则拒绝；`dedupe()` 删除分类内重复项并保留最早的一张。同一图片允许出现在不同分类。
- 随机地址 `<图片根地址>/<分类>` 用每分类一个洗牌袋，只在 Bot 可见的图片中取：一轮内每张只返回一次，换轮时避免与上一张相同；上传、移动、重扫、重新显示图片后重洗。状态只在内存中。
- 可见性分两级：分类的 `exposed` 与 `randomOnly`，图片的 `exposed`（`ImageEntry.exposed`，`meta.json` 中按文件名存在分类的 `hidden`，`moveImage` 复制条目所以改名、移动后保留）。`renderPrompt` 只计入可见图片，`randomOnly` 分类只列分类头并标注「只能随机」、不列文件名。提示词不设文件数上限：以分类和图片级的可见性取代原 `promptFileLimit` 设置；`library.settings` 只取 `DEFAULT_SETTINGS` 中的键，旧版留下的已删除项读取时忽略、下次保存时清除。
- 不注册聊天指令：随机与指定发图都通过图片地址完成，Bot 在 `<img src>` 中写随机地址或指定地址。
- 不注册自定义回复元素：Bot 用 v2 内置的 `<img src>` 发送图片，`src` 用 HTTP 地址而不是本地路径。v2 对 `http(s)://` 原样交给适配器、由平台下载，不经过 `fs:read` 授权和工作区检查，平台与 ChatLuna 不在同一台机器时也能发送。`prompt.ts` 在 `chatluna/agent-open` 时给每个 Agent 注册 id 为 `image-host` 的 context 区提示词块（插件加载前已打开的 Agent 通过 `ctx.agents.list()` 补上），模板中 `{url}` 展开为图片根地址（`utils.ts` 的 `publicImageUrl`，基于设置 `baseUrl`，留空用 `ctx.server.baseUrl`）、`{categories}` 展开为可见且有图的分类清单，设置关闭注入或渲染为空时不注入。默认模板（`utils.ts` 的 `DEFAULT_PROMPT`）只提供图片地址和清单，不写 `<img>` 等表达方式的用法：v2 已注入内置元素说明，重复会冗余甚至冲突。注册表在 `chatluna/agent-close` 时移除对应项，插件卸载时撤回全部块。
- `public.ts` 注册 `/image-host/raw/:category` 与 `/image-host/raw/:category/:file` 供平台下载：平台请求不带登录凭据，所以不鉴权，只提供 Bot 可见的分类和图片，隐藏的分类或图片、`randomOnly` 分类的指定地址返回 404；分类和文件名大小写不敏感，文件名可省略扩展名。随机地址 `no-store`，指定地址只短时缓存，改名、替换或隐藏后很快生效。`webui.ts` 对它 `exclude` 掉 SPA 回退。
- `webui.ts` 声明 `States`/`Actions` 线上契约。上传走 Base64 action，单批数量和体积由客户端控制、服务端按设置的 `maxFileSize` 校验并识别文件头。`image-host.settings.save` 的取值范围在 action 的 Schema 中校验，客户端做同样的检查只为即时提示。图片预览走 `/image-host/files/:category/:file`，不在 `/api` 下以便 `<img>` 直接加载，必须先 `verifyCookie`，并 `exclude` 掉 SPA 回退。
- `types.ts` 与 `utils.ts` 不依赖 Node 内置模块，客户端直接导入；需要 Node 的逻辑（如哈希）放在 `library.ts`。
- 错误用 `@chatluna/protocol` 的 `ChatLunaError`（`validationError`、`notFound`、conflict），由宿主 handler 映射成对应 HTTP 状态。
