import type { CategoryView, Settings } from './types'

// 本文件不依赖 Node 内置模块，WebUI 客户端也直接导入。
// 分类名和文件名同时是磁盘路径段和图片地址片段：排除路径分隔符、Windows 保留字符、
// 会被消息元素转义的 & < > " '，以及空白（Bot 写进 src 属性时容易断开）。
const forbidden = /[\s/\\:*?"<>|&']/u

export const imageTypes = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
} as const

export type ImageMime = keyof typeof imageTypes

const extensions: Record<string, ImageMime> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
}

/** 返回不合法的原因；合法时返回 undefined。 */
export function invalidName(name: string, kind: '分类名' | '文件名'): string | undefined {
    if (name === '') return `${kind}不能为空`
    if (name.length > 64) return `${kind}不能超过 64 个字符`
    if (forbidden.test(name)) return `${kind}不能包含空白和 / \\ : * ? " < > | & '`
    if (name.startsWith('.')) return `${kind}不能以 . 开头`
    if (name.startsWith('-')) return `${kind}不能以 - 开头`
}

export function mimeOfName(file: string): ImageMime | undefined {
    const dot = file.lastIndexOf('.')
    return dot > 0 ? extensions[file.slice(dot + 1).toLowerCase()] : undefined
}

/** 按文件头识别图片格式，不信任上传时声明的扩展名。 */
export function sniffImage(data: Uint8Array): ImageMime | undefined {
    const ascii = (start: number, end: number) => String.fromCharCode(...data.subarray(start, end))
    if (data[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png'
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
    if (ascii(0, 4) === 'GIF8') return 'image/gif'
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
    if (ascii(0, 2) === 'BM') return 'image/bmp'
}

/** 把上传文件名整理成合法文件名，扩展名以实际格式为准。 */
export function normalizeFileName(name: string, mime: ImageMime) {
    const base = name.replace(/\.[^./\\]*$/u, '')
        .replace(/[\s/\\:*?"<>|&']+/gu, '_')
        .replace(/^[.-]+/u, '')
        .slice(0, 48)
    return `${base || 'image'}.${imageTypes[mime]}`
}

/** 同名文件已存在时追加 -1、-2… 序号。 */
export function uniqueFileName(name: string, taken: (name: string) => boolean) {
    if (!taken(name)) return name
    const dot = name.lastIndexOf('.')
    for (let index = 1; ; index++) {
        const candidate = `${name.slice(0, dot)}-${index}${name.slice(dot)}`
        if (!taken(candidate)) return candidate
    }
}

export const DEFAULT_SETTINGS: Settings = {
    injectPrompt: true,
    promptFileLimit: 50,
    baseUrl: '',
    maxFileSize: 10,
}

/** 供平台下载图片的公开路由，只提供 Bot 可见分类；页面预览走另一条需要登录的路由。 */
export const PUBLIC_ROUTE = '/image-host/raw'

/** 由服务器地址拼出提示词中的图片根地址。 */
export function publicImageUrl(base: string) {
    return base.replace(/\/+$/u, '') + PUBLIC_ROUTE
}

export const DEFAULT_PROMPT = [
    '图床图片的地址为「{url}/分类名/文件名」，「{url}/分类名」随机返回该分类中的一张。只使用下面列出的分类和图片，按分类描述挑选：',
    '{categories}',
].join('\n')

/**
 * 按模板渲染注入的提示词：`{url}` 替换为图片根地址，`{categories}` 替换为可见分类清单。
 * 没有可见图片时返回空字符串，不注入。
 */
export function renderPrompt(template: string, categories: readonly CategoryView[], fileLimit: number, url: string) {
    const lines = categories
        .filter((category) => category.exposed && category.images.length > 0)
        .map((category) => {
            const head = `- ${category.name}（${category.images.length} 张）${category.description ? `：${category.description}` : ''}`
            if (fileLimit === 0) return head
            const files = category.images.slice(0, fileLimit).map((image) => image.file)
            const more = category.images.length > fileLimit ? ` 等 ${category.images.length} 张` : ''
            return `${head}\n  ${files.join('、')}${more}`
        })
    if (lines.length === 0) return ''
    return template.replaceAll('{url}', url).replaceAll('{categories}', lines.join('\n')).trim()
}
