import type { Context } from 'cordis'
import type { Request } from '@cordisjs/plugin-server'
import type { ImageLibrary } from './library'
import { PUBLIC_ROUTE } from './utils'

/**
 * 平台按 `<img src>` 中的 HTTP 地址下载图片，请求不带登录凭据，所以本路由不鉴权，
 * 只提供 Bot 可见分类中的图片；隐藏分类返回 404。分类与文件名的匹配规则与聊天指令一致。
 */
export function registerPublicRoute(ctx: Context, library: ImageLibrary) {
    ctx.server.get(`${PUBLIC_ROUTE}/:category/:file`, async (req: Request & { params: { category: string, file: string } }) => {
        const category = library.find(req.params.category)
        const image = category?.exposed ? library.image(category, req.params.file) : undefined
        if (!category || !image) return new Response(null, { status: 404 })
        return new Response(new Uint8Array(await library.read(category, image)), {
            headers: {
                'content-type': image.mime,
                // 同名文件可能被替换或改为隐藏，只做短时缓存。
                'cache-control': 'public, max-age=60',
            },
        })
    })
}
