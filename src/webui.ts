import type { Context } from 'cordis'
import { Schema } from '@chatluna/schema'
import type {} from '@chatluna/server'
import type {} from '@chatluna/ui-server'
import type {} from '@chatluna/ui-client/client'
import type { Request } from '@cordisjs/plugin-server'
import type { ImageLibrary } from './library'
import type { DedupeResult, LibraryView, UploadFile, UploadResult } from './types'
import { DEFAULT_PROMPT, PUBLIC_ROUTE, renderPrompt } from './utils'

export const FILE_ROUTE = '/image-host/files'

declare module '@chatluna/ui-client/client' {
    interface States {
        'image-host.library': LibraryView
    }
    interface Actions {
        'image-host.category.create'(input: { name: string, description?: string }): void
        'image-host.category.update'(input: { name: string, rename?: string, description?: string, exposed?: boolean }): void
        'image-host.category.delete'(input: { name: string }): void
        'image-host.image.upload'(input: { category: string, files: UploadFile[] }): UploadResult
        'image-host.image.move'(input: { category: string, file: string, target?: string, rename?: string }): void
        'image-host.image.delete'(input: { category: string, files: string[] }): void
        'image-host.dedupe'(input: { category?: string }): DedupeResult
        'image-host.rescan'(input: {}): void
        'image-host.prompt.save'(input: { template?: string }): void
    }
}

export interface WebOptions {
    prefix: string
    injectPrompt: boolean
    promptFileLimit: number
    imageUrl: () => string | undefined
    maxFileSize: number
}

const name = Schema.string().min(1).max(64).required()

/** 侧栏页面的状态与操作；图片预览走带登录 Cookie 校验的独立路由，`<img>` 无法携带 Bearer 头。 */
export function registerWebUI(ctx: Context, library: ImageLibrary, options: WebOptions) {
    const webui = ctx.chatluna_webui
    webui.addEntry({ baseUrl: import.meta.url, source: '../client/index.ts', bundle: '../dist/client.js' })
    webui.exclude(PUBLIC_ROUTE)
    webui.state('image-host.library', {
        get: () => {
            const categories = library.view()
            const url = options.imageUrl()
            return {
                categories,
                prompt: {
                    template: library.prompt,
                    defaultTemplate: DEFAULT_PROMPT,
                    preview: options.injectPrompt && url ? renderPrompt(library.prompt, categories, options.promptFileLimit, url) : '',
                    enabled: options.injectPrompt,
                },
                prefix: options.prefix,
                maxFileSize: options.maxFileSize,
                fileRoute: FILE_ROUTE,
            }
        },
    })

    webui.action('image-host.category.create', {
        input: Schema.object({ name, description: Schema.string().max(500) }),
    }, ({ name, description }) => library.createCategory(name, description))
    webui.action('image-host.category.update', {
        input: Schema.object({ name, rename: Schema.string().max(64), description: Schema.string().max(500), exposed: Schema.boolean() }),
    }, ({ name, ...patch }) => library.updateCategory(name, patch))
    webui.action('image-host.category.delete', {
        input: Schema.object({ name }),
    }, ({ name }) => library.deleteCategory(name))
    webui.action('image-host.image.upload', {
        input: Schema.object({
            category: name,
            files: Schema.array(Schema.object({ name: Schema.string().max(255).required(), content: Schema.string().required() })).min(1).max(50).required(),
        }),
    }, ({ category, files }) => library.upload(category, files, options.maxFileSize))
    webui.action('image-host.image.move', {
        input: Schema.object({ category: name, file: name, target: Schema.string().max(64), rename: Schema.string().max(64) }),
    }, ({ category, file, target, rename }) => library.moveImage(category, file, { category: target, file: rename }))
    webui.action('image-host.image.delete', {
        input: Schema.object({ category: name, files: Schema.array(Schema.string()).min(1).required() }),
    }, ({ category, files }) => library.deleteImages(category, files))
    webui.action('image-host.dedupe', {
        input: Schema.object({ category: Schema.string().max(64) }),
    }, ({ category }) => library.dedupe(category))
    webui.action('image-host.rescan', {}, () => library.rescan())
    webui.action('image-host.prompt.save', {
        input: Schema.object({ template: Schema.string().max(8000) }),
    }, ({ template }) => library.setPrompt(template))

    ctx.inject(['server', 'chatluna_server'], (ctx) => {
        ctx.chatluna_webui.exclude(FILE_ROUTE)
        ctx.server.get(`${FILE_ROUTE}/:category/:file`, async (req: Request & { params: { category: string, file: string } }) => {
            if (!ctx.chatluna_server.verifyCookie(req)) return new Response(null, { status: 401 })
            const category = library.find(req.params.category)
            const image = category && category.images.get(req.params.file)
            if (!image) return new Response(null, { status: 404 })
            // Buffer 的底层可能是 SharedArrayBuffer，不满足 BodyInit，复制成独立的 Uint8Array。
            return new Response(new Uint8Array(await library.read(category, image)), {
                headers: {
                    'content-type': image.mime,
                    // 地址带内容哈希参数，内容变化时地址随之变化，可以长期缓存。
                    'cache-control': 'private, max-age=31536000, immutable',
                },
            })
        })
    })
}
