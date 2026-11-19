import type { Context } from 'cordis'
import type {} from 'koishi'
import { h } from '@satorijs/core'
import type { ImageLibrary } from './library'

/**
 * 拦截 `<前缀><分类>` 与 `<前缀><分类>/<文件>`。分类名可随时增删且可能含 `.`，无法注册成 Koishi 指令，
 * 因此用前置中间件匹配原始文本；分类不存在或与已注册指令同名时交还给后续中间件。
 */
export function registerCommands(ctx: Context, library: ImageLibrary, prefix: string) {
    ctx.middleware(async (session, next) => {
        // 宿主配置了同样的指令前缀时，Koishi 会把前缀从 content 中剥离并记在 prefix 上，这里拼回原文。
        const text = `${session.stripped.prefix ?? ''}${session.stripped.content ?? ''}`.trim()
        if (!text.startsWith(prefix)) return next()
        const [name, file, ...rest] = text.slice(prefix.length).split('/')
        if (!name || rest.length || file === '') return next()
        const category = library.find(name)
        if (!category || ctx.$commander.get(name)) return next()
        const image = file === undefined ? library.pick(category) : library.image(category, file)
        if (!image) return file === undefined ? `分类「${category.name}」中还没有图片。` : `分类「${category.name}」中没有图片：${file}`
        try {
            return h.image(await library.read(category, image), image.mime)
        } catch (error) {
            ctx.logger.warn('Failed to read %s/%s: %s', category.name, image.file, error instanceof Error ? error.message : String(error))
            return '图片读取失败。'
        }
    }, true)
}
