import type { Context } from 'cordis'
import type { Request } from '@cordisjs/plugin-server'
import type { ImageLibrary } from './library'
import { PUBLIC_ROUTE } from './utils'

type Params = { category: string, file?: string }

/**
 * 平台按 `<img src>` 中的 HTTP 地址下载图片，请求不带登录凭据，所以本路由不鉴权，只提供 Bot 可见的分类和图片，
 * 隐藏的分类或图片返回 404。`/<分类>` 按洗牌袋轮转随机返回一张，`/<分类>/<文件>` 返回指定图片，
 * 「只能随机」的分类不提供指定地址；分类与文件名大小写不敏感，文件名可省略扩展名。
 */
export function registerPublicRoute(ctx: Context, library: ImageLibrary) {
    const serve = async (req: Request & { params: Params }) => {
        const category = library.find(req.params.category)
        if (!category?.exposed) return new Response(null, { status: 404 })
        const random = req.params.file === undefined
        if (!random && category.randomOnly) return new Response(null, { status: 404 })
        const image = random ? library.pick(category) : library.image(category, req.params.file!)
        if (!image?.exposed) return new Response(null, { status: 404 })
        return new Response(new Uint8Array(await library.read(category, image)), {
            headers: {
                'content-type': image.mime,
                // 随机地址每次请求结果不同，不能缓存；指定地址的文件可能被替换或改为隐藏，只做短时缓存。
                'cache-control': random ? 'no-store' : 'public, max-age=60',
            },
        })
    }
    ctx.server.get(`${PUBLIC_ROUTE}/:category`, serve)
    ctx.server.get(`${PUBLIC_ROUTE}/:category/:file`, serve)
}
