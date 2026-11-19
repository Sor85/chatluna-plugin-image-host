import type { Context } from 'cordis'
import type {} from 'koishi'
import { Schema } from '@chatluna/schema'
import { resolveFromBaseUrl } from '@chatluna/utils'
import { registerCommands } from './commands'
import { ImageLibrary } from './library'
import { registerPrompt } from './prompt'
import { registerWebUI } from './webui'

export const name = 'chatluna-image-host'

export type * from './types'

export interface Config {
    prefix: string
    injectPrompt: boolean
    promptFileLimit: number
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
            .description('向 Bot 注入图床提示词，列出可见分类与图片路径，Bot 用 <img> 发送。提示词模板在侧栏「图床」页面查看和修改。'),
        promptFileLimit: Schema.natural().max(500).default(50)
            .extra('label', '提示词列出文件数')
            .description('每个分类在提示词中最多列出的文件名数量，Bot 只能发送列出的图片；为 0 时只列出分类。'),
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
    if (config.injectPrompt) ctx.inject(['agents'], (ctx) => registerPrompt(ctx, library, config.promptFileLimit))
    ctx.inject(['chatluna_webui'], (ctx) => registerWebUI(ctx, library, {
        prefix: config.prefix,
        injectPrompt: config.injectPrompt,
        promptFileLimit: config.promptFileLimit,
        maxFileSize: config.maxFileSize * 1024 * 1024,
    }))
}
