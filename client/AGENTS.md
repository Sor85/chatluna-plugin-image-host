# client/AGENTS.md

适用范围：`client/` 的 WebUI 侧栏页面。需同时遵守根 `../AGENTS.md`；数据契约见 `../src/AGENTS.md` 与 `../src/webui.ts`。

- 入口用 `ctx.slots.route` 注册 `/image-host/:category?`，放在 `capabilities` 分组，图标为 Lucide 名称字符串 `images`。文案只放 `locales/zh.yml`、`locales/en.yml`，组件通过 `useT()` 读取；参数占位符用 `{name}` 形式，需要原样显示花括号时作为参数传入（如 `{placeholder}`）。
- 组件只用 `@chatluna/ui-kit` 与 `@chatluna/ui-client/client`（`useLive`、`useAction`、`toast`），图标用 `lucide-react`，与宿主页面一致；弹窗、滚动与指针行为沿用 ui-kit，不自行覆盖。
- 页面根容器声明 `text-sm leading-5`。分类在左栏，选中分类由路由参数决定；提示词编辑在 `?tab=prompt`，插件设置在 `?tab=settings`（插件没有宿主配置项）。
- 上传支持选择、拖入和粘贴，客户端先按 `maxFileSize` 过滤，再按 16 MB / 20 张分批调用 `image-host.image.upload`，汇总新增、重复、失败后统一提示上传中显示按文件计数的进度条，同一时间只允许一次上传；粘贴监听只注册一次（经 ref 调用最新的 `send`），有弹窗打开时不处理粘贴。
- 复制文本用 ui-kit 的 `useCopyText`/`CodeValue`，不直接调 `navigator.clipboard`：通过局域网 HTTP 访问时没有该 API。
- 图片支持多选：有选中项时点击缩略图切换选中，工具栏换成批量「对 Bot 隐藏/显示」「删除」（`expose`/`delete` action 本身接受文件数组），Esc 取消选择。排序、搜索只影响页面展示，预览弹窗的上一张/下一张沿用当前排序和筛选结果。
- 提示词与设置的保存按钮接 `useSaveShortcut`（⌘S / Ctrl+S）；提示词长度上限与 `image-host.prompt.save` 的 Schema 一致（8000）。
- 图片地址由 `imageUrl()` 拼接 `apiBase()` + `fileRoute`，附带内容哈希作为缓存键；不要改成 `/api` 路径，`<img>` 无法携带 Bearer 头。
- 提示词编辑器与设置面板的草稿未修改时跟随其他窗口的保存结果，已修改时不覆盖；提示词预览只反映已保存模板。
- 分类面板和预览弹窗展示公开图片地址（`LibraryView.imageUrl` + 分类 [+ 文件]），隐藏分类和没有 `server` 时不展示，「只能随机」的分类和对 Bot 隐藏的图片不展示指定地址，因为这些地址会返回 404。
- 分类的「Bot 可见」「只能随机」开关与公开地址放在标题下方同一个访问栏（`AccessBar`），因为开关直接决定地址是否可用，图片的「对 Bot 隐藏」放在图片卡片菜单（`image-host.image.expose`）；隐藏图片的缩略图降低不透明度并带 `EyeOffIcon`，「只能随机」的分类在左栏带 `ShuffleIcon`。这些可见性设置不放「设置」标签，那里只放插件级设置。
