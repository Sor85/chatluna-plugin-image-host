// 服务端与 WebUI 共用的线上契约，只放类型和纯数据，客户端可直接导入。

export interface ImageEntry {
    file: string
    size: number
    mime: string
    /** 文件内容的 SHA-256，同一分类内唯一，用于去重和缩略图缓存键。 */
    hash: string
    mtime: number
}

export interface CategoryView {
    name: string
    description: string
    /** 关闭后该分类不写进提示词，Bot 看不到，指令仍可使用。 */
    exposed: boolean
    images: ImageEntry[]
}

export interface LibraryView {
    categories: CategoryView[]
    prompt: {
        template: string
        defaultTemplate: string
        /** 按当前图库渲染后注入给 Bot 的文本；未启用注入或没有可用分类时为空字符串。 */
        preview: string
        enabled: boolean
    }
    prefix: string
    maxFileSize: number
    /** 图片预览地址前缀，后接 `/<分类>/<文件>`；未加载服务端路由时为空。 */
    fileRoute: string
}

export interface UploadFile {
    name: string
    /** Base64 编码的文件内容。 */
    content: string
}

export interface UploadResult {
    added: string[]
    duplicates: { name: string, existing: string }[]
    errors: { name: string, message: string }[]
}

export interface DedupeResult {
    removed: { category: string, file: string, kept: string }[]
}
