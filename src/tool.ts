import type { Context, Disposable } from 'cordis'
import { Schema } from '@chatluna/schema'
import type { Agent } from '@chatluna/agent'
import type { ChatFileBlock } from '@chatluna/message'
import type {} from '@chatluna/tool'
import { fileRefTableOf } from '@chatluna/transform'
import type { ImageLibrary } from './library'

export const TOOL_NAME = 'image_host_save'

const MB = 1024 * 1024

interface SaveArgs {
    ref: string
    category: string
    name: string
}

/** `chatluna_storage` 由 `@chatluna/storage-files` 提供，只用到读取原图这一项。 */
interface Storage {
    readFile(id: string): Promise<{ buffer: Buffer } | null>
}

/**
 * 只取 ChatLuna 收到消息时已保存的原图，不按 URL 重新下载：URL 型数据说明入库时下载失败或没有存储服务，
 * 这时直接报错，工具本身不发起网络请求。
 */
async function bytesOf(ctx: Context, block: ChatFileBlock) {
    const { data } = block
    if (data.type === 'data') {
        const comma = data.data.indexOf(',')
        const head = data.data.slice(0, comma)
        const body = data.data.slice(comma + 1)
        return head.endsWith(';base64') ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body))
    }
    if (data.type === 'reference' && data.reference.startsWith('storage://')) {
        const storage = (ctx.get as (name: string) => Storage | undefined)('chatluna_storage')
        if (!storage) throw new Error('未加载文件存储服务，无法读取原图')
        const file = await storage.readFile(data.reference.slice('storage://'.length))
        if (!file) throw new Error('原图已过期，无法存入图床')
        return file.buffer
    }
    throw new Error('ChatLuna 没有保存这张图片的原图，无法存入图床')
}

function define(ctx: Context, library: ImageLibrary, imageUrl: () => string, categories: { name: string, description: string }[]) {
    const list = categories.map(({ name, description }) => description ? `${name} (${description})` : name).join(', ')
    return ctx.tools.define<SaveArgs>({
        name: TOOL_NAME,
        description: 'Save an image from this conversation into the image host so it can be sent again later by its image URL. '
            + 'Use it when the user asks to keep or collect an image, or when an image clearly fits a category. '
            + 'An identical image already in the category is not stored twice; a taken name gets a numeric suffix.',
        locales: {
            zh: {
                description: '把对话中的图片存入图床，之后可按图片地址再次发送。分类内已有相同图片时不重复存入，重名时追加序号。',
                args: {
                    ref: '对话中图片占位 <img ref="…"/> 的 ref。',
                    category: '存入的分类，只能是对 Bot 可见的已有分类。',
                    name: '不带扩展名的简短描述性文件名，之后按它挑选图片。',
                },
            },
        },
        args: Schema.object({
            ref: Schema.string().min(1).required().description('The ref of an <img ref="…"/> placeholder in this conversation, e.g. i3f9a2c.'),
            category: Schema.union(categories.map(({ name }) => name)).required().description(`Target category: ${list}.`),
            name: Schema.string().min(1).max(48).required()
                .description('Short descriptive file name without extension, in the language of the conversation; images are listed and picked by it later.'),
        }),
        traits: { effect: 'write', timeout: 30000 },
        async run({ ref, category, name }, call) {
            const agent = call.agent as Agent | undefined
            if (!agent) throw new Error('当前调用不属于任何对话，无法查找图片')
            const block = fileRefTableOf(await agent.session.messages()).resolve(ref)
            if (!block) throw new Error(`对话中没有 ref 为 ${ref} 的图片`)
            if (!block.mediaType.startsWith('image/')) throw new Error(`${ref} 不是图片`)
            // 加上占位扩展名，避免名称中的点被当成扩展名截掉；实际扩展名按文件头确定。
            const result = await library.save(category, { name: `${name}.img`, data: await bytesOf(ctx, block) }, library.settings.maxFileSize * MB)
            if (result.errors[0]) throw new Error(result.errors[0].message)
            const target = library.find(category)!
            const url = imageUrl()
            const link = (file: string) => (url && !target.randomOnly ? `，图片地址 ${url}/${target.name}/${file}` : '')
            const duplicate = result.duplicates[0]
            if (duplicate) return `分类「${target.name}」已有相同图片：${duplicate.existing}${link(duplicate.existing)}`
            const file = result.added[0]!
            return `已存入分类「${target.name}」：${file}${link(file)}`
        },
    })
}

/**
 * 注册 `image_host_save` 工具，让 Bot 把对话中的图片存入图床。分类参数是对 Bot 可见分类的枚举，
 * 所以分类增删、改名、改描述或可见性后重新注册；设置中关闭或没有可见分类时不提供该工具。
 */
export function registerTool(ctx: Context, library: ImageLibrary, imageUrl: () => string) {
    let key = ''
    let dispose: Disposable | undefined
    const sync = () => {
        const categories = library.settings.botSave
            ? library.view().filter((category) => category.exposed).map(({ name, description }) => ({ name, description }))
            : []
        const next = categories.length ? JSON.stringify(categories) : ''
        if (next === key) return
        dispose?.()
        dispose = undefined
        key = next
        if (next) dispose = define(ctx, library, imageUrl, categories)
    }
    sync()
    ctx.effect(() => library.watch(sync))
}
