# AGENTS.md — chatluna-plugin-image-host

ChatLuna v2（Cordis 4）外部插件：WebUI 侧栏「图床」页面上传、分类、去重管理图片；向 Bot 注入可编辑的提示词，列出图片路径供 Bot 用内置 `<img>` 发图；图片地址 `<根地址>/<分类>` 随机返回一张、`<根地址>/<分类>/<文件>` 返回指定图片；设置全部在侧栏页面中修改。协议 MIT。

## 仓库与验证

- 当前目录是唯一源码；`external/image-host` 只是 ChatLuna v2 开发仓库中的单向同步副本，不在副本里改源码。
- 本目录不安装依赖、不生成锁文件，脚本直接用 `node` 运行。同步：`node scripts/sync-to-v2.mjs [v2 仓库路径]`，省略时读 `CHATLUNA_V2_ROOT`，再默认 `../../chatluna-v2-mirror`。同步只覆盖不删除，改名或删除源码文件后需手动清理副本中的旧文件。
- 首次同步或依赖变化后在 v2 根目录 `yarn install`；构建 `yarn yakumo build image-host`；在副本中 `yarn test`、`yarn typecheck`。改动代码、配置或发布文档后必须重新同步、构建并汇报结果。
- 新增 Tailwind 类名或改服务端代码后，完整停止宿主 launcher 与 worker、确认端口释放后再启动单一实例验证。
- 非机械变更在 `.agents/notes/implemented/` 同步维护中英文说明。未获授权不创建分支、提交、发布或修改宿主运行配置。

- `package.json` 不能声明 `koishi` 依赖：宿主据此把包识别为 Koishi 旧插件并包装上下文，`ctx.server` 会变成 Koa 风格外观，图片路由随之失效。插件不使用 Koishi 能力。

## 数据与安全

- 运行数据在固定目录 `data/chatluna/image-host`：`images/<分类>/<文件>` 为唯一事实来源，`meta.json` 只存设置、分类描述、可见性、提示词模板和哈希缓存。不引入数据库表。
- 公开图片地址的路径段只能解析为图库中已存在的分类和文件，不得当作磁盘路径；分类名与文件名禁止路径分隔符（见 `src/utils.ts` 的 `invalidName`）。
- 测试只用临时目录；沙盒验收只在本次创建的 onebot-sandbox 测试空间中进行，凭据经环境变量传入，不写入源码、日志或报告。

## 子目录说明

- `src/AGENTS.md`：图库存储、设置、去重、轮转取图、公开图片地址、提示词注入与 WebUI 接口的约定。
- `client/AGENTS.md`：侧栏页面的组件、文案与上传交互约定。

新增子目录说明时在此登记；`tests/structure.test.ts` 守卫清单与实际文件一致。
