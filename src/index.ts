import type { Context } from 'cordis'
import type {} from 'koishi'
import type {} from '@cordisjs/plugin-server'
import { Schema } from '@chatluna/schema'
import { resolveFromBaseUrl } from '@chatluna/utils'
import { registerCommands } from './commands'
import { ImageLibrary } from './library'
import { registerPrompt } from './prompt'
import { registerPublicRoute } from './public'
import { publicImageUrl } from './utils'
import { registerWebUI } from './webui'

export const name = 'chatluna-image-host'

export type * from './types'

export interface Config {
    prefix: string
    injectPrompt: boolean
    promptFileLimit: number
    baseUrl: string
    dataDir: string
    maxFileSize: number
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        prefix: Schema.string().pattern(/^[^\s]+$/u).default('/')
            .extra('label', '指令前缀')
            .description('发送「前缀+分类名」随机发送该分类的一张图片，发送「前缀+分类名/文件名」发送指定图片；文件名可省略扩展名。'),
        injectPrompt: Schema.boolean().default(true)
            .extra('label', '注入提示词')
            .description('向 Bot 注入图床提示词，列出可见分类与图片的 HTTP 地址。提示词模板在侧栏「图床」页面查看和修改。'),
        promptFileLimit: Schema.natural().max(500).default(50)
            .extra('label', '提示词列出文件数')
            .description('每个分类在提示词中最多列出的文件名数量，Bot 只能发送列出的图片；为 0 时只列出分类。'),
        baseUrl: Schema.string().default('')
            .extra('label', '图片访问地址')
            .description('聊天平台下载图片时使用的服务器地址，如 http://192.168.1.2:5028。留空时使用 ChatLuna 服务器自身的地址；聊天平台（如 OneBot 实现）与 ChatLuna 不在同一台机器上时需要填写。'),
    }).description('核心功能'),
    Schema.object({
        dataDir: Schema.string().default('data/chatluna/image-host')
            .extra('label', '数据目录')
            .description('图片与元数据的存放目录，相对路径基于 ChatLuna 配置文件所在目录。图片按 images/<分类>/<文件> 存放，可直接放入文件后在页面中重新扫描。'),
        maxFileSize: Schema.natural().min(1).max(50).default(10)
            .extra('label', '单张大小上限（MB）')
            .description('上传单张图片的最大体积。'),
    }).description('存储').collapse(),
])

export const inject = ['koishi']

export async function apply(ctx: Context, config: Config) {
    const library = new ImageLibrary(resolveFromBaseUrl(ctx.baseUrl, config.dataDir), () => ctx.get('chatluna_webui')?.refresh('image-host.library'))
    await library.load()
    registerCommands(ctx, library, config.prefix)
    // 图片经公开路由提供，没有 server 服务时不注入提示词。
    const imageUrl = () => {
        const server = ctx.get('server')
        return server && publicImageUrl(config.baseUrl || server.baseUrl)
    }
    ctx.inject(['server'], (ctx) => registerPublicRoute(ctx, library))
    if (config.injectPrompt) ctx.inject(['agents'], (ctx) => registerPrompt(ctx, library, config.promptFileLimit, imageUrl))
    ctx.inject(['chatluna_webui'], (ctx) => registerWebUI(ctx, library, {
        prefix: config.prefix,
        injectPrompt: config.injectPrompt,
        promptFileLimit: config.promptFileLimit,
        imageUrl,
        maxFileSize: config.maxFileSize * 1024 * 1024,
    }))
}
