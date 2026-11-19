// 服务端与 WebUI 共用的线上契约，只放类型和纯数据，客户端可直接导入。

export interface ImageEntry {
    file: string
    size: number
    mime: string
    /** 文件内容的 SHA-256，同一分类内唯一，用于去重和缩略图缓存键。 */
    hash: string
    mtime: number
    /** 关闭后该图片不写进提示词、不参与随机，指定地址返回 404。 */
    exposed: boolean
}

export interface CategoryView {
    name: string
    description: string
    /** 关闭后该分类不写进提示词，公开图片地址返回 404，只在页面中管理。 */
    exposed: boolean
    /** 开启后提示词只列分类不列文件名，只能用随机地址，指定图片地址返回 404。 */
    randomOnly: boolean
    images: ImageEntry[]
}

/** 插件设置，在侧栏页面修改，保存在 `meta.json`。 */
export interface Settings {
    injectPrompt: boolean
    /** 聊天平台下载图片使用的服务器地址；空字符串时使用 ChatLuna 服务器自身地址。 */
    baseUrl: string
    /** 单张上传上限，单位 MB。 */
    maxFileSize: number
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
    settings: Settings
    defaultSettings: Settings
    /** 设置中图片访问地址留空时使用的服务器地址；没有 server 服务时为空。 */
    serverUrl: string
    /** 提示词和平台使用的图片根地址，后接 `/<分类>[/<文件>]`；没有 server 服务时为空。 */
    imageUrl: string
    /** 图片根目录的绝对路径，直接放入 `<分类>/<文件>` 后重新扫描即可载入。 */
    imageDir: string
    /** 页面预览地址前缀，后接 `/<分类>/<文件>`，需要登录。 */
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
