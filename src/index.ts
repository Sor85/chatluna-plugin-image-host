import type { Context } from 'cordis'
import type {} from '@cordisjs/plugin-server'
import { Schema } from '@chatluna/schema'
import { resolveFromBaseUrl } from '@chatluna/utils'
import { ImageLibrary } from './library'
import { registerPrompt } from './prompt'
import { registerPublicRoute } from './public'
import { publicImageUrl } from './utils'
import { registerWebUI } from './webui'

export const name = 'chatluna-image-host'

export type * from './types'

/** 数据目录固定，设置本身保存在其中的 `meta.json`；相对 ChatLuna 配置文件所在目录。 */
export const DATA_DIR = 'data/chatluna/image-host'

// 设置全部在侧栏「图床」页面中修改，插件本身没有配置项。导出只带说明的空 Schema，
// 插件管理页据此显示说明，而不是回退到原始 YAML 编辑器。
export const Config = Schema.object({}).description('设置在图床工作台的「设置」页编辑')

export async function apply(ctx: Context) {
    const library = new ImageLibrary(resolveFromBaseUrl(ctx.baseUrl, DATA_DIR), () => ctx.get('chatluna_webui')?.refresh('image-host.library'))
    await library.load()
    // 图片经公开路由提供，没有 server 服务时没有图片地址，也不注入提示词。
    const serverUrl = () => ctx.get('server')?.baseUrl ?? ''
    const imageUrl = () => (ctx.get('server') ? publicImageUrl(library.settings.baseUrl || serverUrl()) : '')
    ctx.inject(['server'], (ctx) => registerPublicRoute(ctx, library))
    ctx.inject(['agents'], (ctx) => registerPrompt(ctx, library, imageUrl))
    ctx.inject(['chatluna_webui'], (ctx) => registerWebUI(ctx, library, { serverUrl, imageUrl }))
}
