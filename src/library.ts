import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ChatLunaError, notFound, validationError } from '@chatluna/protocol'
import type { CategoryView, DedupeResult, ImageEntry, Settings, UploadFile, UploadResult } from './types'
import { DEFAULT_PROMPT, DEFAULT_SETTINGS, invalidName, mimeOfName, normalizeFileName, sniffImage, uniqueFileName } from './utils'

interface CategoryMeta {
    description?: string
    exposed?: boolean
}

interface Meta {
    prompt?: string
    /** 只存与默认值不同的项。 */
    settings?: Partial<Settings>
    categories: Record<string, CategoryMeta>
    /** 以 `分类/文件` 为键的哈希缓存，大小和修改时间不变时重扫不再读文件。 */
    hashes: Record<string, { hash: string, size: number, mtime: number }>
}

interface Category {
    name: string
    description: string
    exposed: boolean
    images: Map<string, ImageEntry>
}

function conflict(message: string) {
    return new ChatLunaError({ code: 'conflict', category: 'conflict', message, retryable: false })
}

function assertName(name: string, kind: '分类名' | '文件名') {
    const reason = invalidName(name, kind)
    if (reason) throw validationError(reason)
}

function hashOf(data: Uint8Array) {
    return createHash('sha256').update(data).digest('hex')
}

function shuffle<T>(items: T[]) {
    for (let index = items.length - 1; index > 0; index--) {
        const other = Math.floor(Math.random() * (index + 1))
        ;[items[index], items[other]] = [items[other]!, items[index]!]
    }
    return items
}

/**
 * 图库以磁盘为准：`images/<分类>/<文件>`，分类即目录。`meta.json` 只存分类描述、设置、提示词模板和哈希缓存。
 * 所有修改串行执行，结束后写回元数据并通知订阅方。
 */
export class ImageLibrary {
    private categories = new Map<string, Category>()
    private meta: Meta = { categories: {}, hashes: {} }
    /** 每个分类一轮洗好的待发文件，发完一轮再重洗，保证一轮内不重复。 */
    private bags = new Map<string, string[]>()
    private last = new Map<string, string>()
    private queue: Promise<unknown> = Promise.resolve()
    readonly imageDir: string

    constructor(private root: string, private onChange: () => void) {
        this.imageDir = join(root, 'images')
    }

    get prompt() {
        return this.meta.prompt ?? DEFAULT_PROMPT
    }

    get settings(): Settings {
        return { ...DEFAULT_SETTINGS, ...this.meta.settings }
    }

    view(): CategoryView[] {
        return [...this.categories.values()]
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
            .map((category) => ({
                name: category.name,
                description: category.description,
                exposed: category.exposed,
                images: [...category.images.values()]
                    .sort((a, b) => a.mtime - b.mtime || a.file.localeCompare(b.file, 'zh-CN', { numeric: true })),
            }))
    }

    /** 先精确匹配，再忽略大小写匹配，容忍 Bot 写错英文分类名的大小写。 */
    find(name: string) {
        const exact = this.categories.get(name)
        if (exact) return exact
        const lower = name.toLowerCase()
        return [...this.categories.values()].find((category) => category.name.toLowerCase() === lower)
    }

    image(category: Category, file: string) {
        const exact = category.images.get(file)
        if (exact) return exact
        const lower = file.toLowerCase()
        return [...category.images.values()].find((image) => image.file.toLowerCase() === lower)
            // 允许省略扩展名：猫猫/a 等价于 猫猫/a.png，仅在唯一匹配时生效。
            ?? this.uniqueByStem(category, lower)
    }

    private uniqueByStem(category: Category, stem: string) {
        const matches = [...category.images.values()].filter((image) => image.file.toLowerCase().replace(/\.[^.]*$/u, '') === stem)
        return matches.length === 1 ? matches[0] : undefined
    }

    /** 洗牌轮转取图：一轮内每张只出现一次，换轮时避免与上一张相同。 */
    pick(category: Category) {
        if (category.images.size === 0) return
        let bag = (this.bags.get(category.name) ?? []).filter((file) => category.images.has(file))
        if (bag.length === 0) {
            bag = shuffle([...category.images.keys()])
            if (bag.length > 1 && bag.at(-1) === this.last.get(category.name)) {
                ;[bag[0], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[0]!]
            }
        }
        const file = bag.pop()!
        this.bags.set(category.name, bag)
        this.last.set(category.name, file)
        return category.images.get(file)
    }

    read(category: Category, image: ImageEntry) {
        return readFile(join(this.imageDir, category.name, image.file))
    }

    load() {
        return this.run(async () => {
            this.meta = await this.readMeta()
            await this.scan()
        })
    }

    rescan() {
        return this.run(() => this.scan())
    }

    createCategory(name: string, description = '') {
        return this.run(async () => {
            assertName(name, '分类名')
            if (this.find(name)) throw conflict(`分类已存在：${name}`)
            await mkdir(join(this.imageDir, name), { recursive: true })
            this.meta.categories[name] = { description }
            this.categories.set(name, { name, description, exposed: true, images: new Map() })
        })
    }

    updateCategory(name: string, patch: { rename?: string, description?: string, exposed?: boolean }) {
        return this.run(async () => {
            const category = this.require(name)
            if (patch.rename !== undefined && patch.rename !== category.name) {
                assertName(patch.rename, '分类名')
                const existing = this.find(patch.rename)
                if (existing && existing !== category) throw conflict(`分类已存在：${patch.rename}`)
                await rename(join(this.imageDir, category.name), join(this.imageDir, patch.rename))
                this.forget(category)
                this.categories.delete(category.name)
                category.name = patch.rename
                this.categories.set(category.name, category)
            }
            category.description = patch.description ?? category.description
            category.exposed = patch.exposed ?? category.exposed
        })
    }

    deleteCategory(name: string) {
        return this.run(async () => {
            const category = this.require(name)
            await rm(join(this.imageDir, category.name), { recursive: true, force: true })
            this.forget(category)
            this.categories.delete(category.name)
        })
    }

    upload(name: string, files: readonly UploadFile[], maxSize: number) {
        return this.run(async () => {
            const category = this.require(name)
            const result: UploadResult = { added: [], duplicates: [], errors: [] }
            const hashes = new Map([...category.images.values()].map((image) => [image.hash, image.file]))
            for (const upload of files) {
                const data = Buffer.from(upload.content, 'base64')
                if (data.length === 0) {
                    result.errors.push({ name: upload.name, message: '文件为空' })
                    continue
                }
                if (data.length > maxSize) {
                    result.errors.push({ name: upload.name, message: `超过 ${Math.round(maxSize / 1024 / 1024)} MB 上限` })
                    continue
                }
                const mime = sniffImage(data)
                if (!mime) {
                    result.errors.push({ name: upload.name, message: '不是支持的图片格式（PNG、JPEG、GIF、WebP、BMP）' })
                    continue
                }
                const hash = hashOf(data)
                const existing = hashes.get(hash)
                if (existing) {
                    result.duplicates.push({ name: upload.name, existing })
                    continue
                }
                // 大小写不敏感的文件系统上 A.png 与 a.png 是同一个文件。
                const file = uniqueFileName(normalizeFileName(upload.name, mime), (candidate) =>
                    [...category.images.keys()].some((taken) => taken.toLowerCase() === candidate.toLowerCase()))
                await writeFile(join(this.imageDir, category.name, file), data)
                const info = await stat(join(this.imageDir, category.name, file))
                category.images.set(file, { file, size: data.length, mime, hash, mtime: info.mtimeMs })
                hashes.set(hash, file)
                result.added.push(file)
            }
            // 新图加入后重新洗牌，让它们进入当前轮次。
            this.bags.delete(category.name)
            return result
        })
    }

    /** 重命名图片或移到其他分类；目标分类已有相同内容时拒绝，避免移动造成重复。 */
    moveImage(name: string, file: string, target: { category?: string, file?: string }) {
        return this.run(async () => {
            const from = this.require(name)
            const image = this.requireImage(from, file)
            const to = target.category === undefined ? from : this.require(target.category)
            const next = target.file ?? image.file
            assertName(next, '文件名')
            if (mimeOfName(next) !== image.mime) throw validationError('不能修改图片扩展名')
            if (to === from && next === image.file) return
            const clash = this.image(to, next)
            if (clash && clash !== image) throw conflict(`文件已存在：${to.name}/${clash.file}`)
            if (to !== from) {
                const same = [...to.images.values()].find((entry) => entry.hash === image.hash)
                if (same) throw conflict(`分类「${to.name}」已有相同图片：${same.file}`)
            }
            await rename(join(this.imageDir, from.name, image.file), join(this.imageDir, to.name, next))
            from.images.delete(image.file)
            to.images.set(next, { ...image, file: next })
            this.bags.delete(from.name)
            this.bags.delete(to.name)
        })
    }

    deleteImages(name: string, files: readonly string[]) {
        return this.run(async () => {
            const category = this.require(name)
            for (const file of files) {
                const image = this.requireImage(category, file)
                await rm(join(this.imageDir, category.name, image.file), { force: true })
                category.images.delete(image.file)
            }
        })
    }

    /** 同一分类内按内容哈希去重，每组保留最早的一张。省略分类时处理全部分类。 */
    dedupe(name?: string) {
        return this.run(async () => {
            const targets = name === undefined ? [...this.categories.values()] : [this.require(name)]
            const result: DedupeResult = { removed: [] }
            for (const category of targets) {
                const kept = new Map<string, string>()
                const images = [...category.images.values()].sort((a, b) => a.mtime - b.mtime || a.file.localeCompare(b.file))
                for (const image of images) {
                    const first = kept.get(image.hash)
                    if (first === undefined) {
                        kept.set(image.hash, image.file)
                        continue
                    }
                    await rm(join(this.imageDir, category.name, image.file), { force: true })
                    category.images.delete(image.file)
                    result.removed.push({ category: category.name, file: image.file, kept: first })
                }
            }
            return result
        })
    }

    /** 取值范围由调用方校验；与默认值相同的项不写入，默认值变化时自动跟随。 */
    setSettings(patch: Partial<Settings>) {
        return this.run(async () => {
            const next = { ...this.settings, ...patch, baseUrl: (patch.baseUrl ?? this.settings.baseUrl).trim().replace(/\/+$/u, '') }
            const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]
            const changed = Object.fromEntries(keys.filter((key) => next[key] !== DEFAULT_SETTINGS[key]).map((key) => [key, next[key]]))
            this.meta.settings = Object.keys(changed).length ? changed : undefined
        })
    }

    /** 传入 undefined 时恢复默认模板。 */
    setPrompt(template: string | undefined) {
        return this.run(async () => {
            this.meta.prompt = template === undefined || template === DEFAULT_PROMPT ? undefined : template
        })
    }

    private require(name: string) {
        const category = this.find(name)
        if (!category) throw notFound(`分类不存在：${name}`)
        return category
    }

    private requireImage(category: Category, file: string) {
        const image = category.images.get(file)
        if (!image) throw notFound(`图片不存在：${category.name}/${file}`)
        return image
    }

    private forget(category: Category) {
        this.bags.delete(category.name)
        this.last.delete(category.name)
    }

    /** 串行执行修改，完成后同步元数据并通知；失败不影响后续任务。 */
    private run<T>(task: () => Promise<T>): Promise<T> {
        const next = this.queue.then(async () => {
            const value = await task()
            await this.writeMeta()
            this.onChange()
            return value
        })
        this.queue = next.catch(() => {})
        return next
    }

    private async readMeta(): Promise<Meta> {
        try {
            const parsed: Partial<Meta> = JSON.parse(await readFile(join(this.root, 'meta.json'), 'utf8'))
            return { prompt: parsed.prompt, settings: parsed.settings, categories: parsed.categories ?? {}, hashes: parsed.hashes ?? {} }
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { categories: {}, hashes: {} }
            throw error
        }
    }

    private async writeMeta() {
        this.meta.categories = Object.fromEntries([...this.categories.values()].map((category) => [
            category.name,
            { description: category.description || undefined, exposed: category.exposed ? undefined : false },
        ]))
        this.meta.hashes = Object.fromEntries([...this.categories.values()].flatMap((category) =>
            [...category.images.values()].map((image) => [`${category.name}/${image.file}`, { hash: image.hash, size: image.size, mtime: image.mtime }])))
        const file = join(this.root, 'meta.json')
        await writeFile(`${file}.tmp`, JSON.stringify(this.meta, null, 2))
        await rename(`${file}.tmp`, file)
    }

    /** 从磁盘重建图库；名称不合法或格式不支持的文件跳过，不做改名。 */
    private async scan() {
        await mkdir(this.imageDir, { recursive: true })
        const categories = new Map<string, Category>()
        for (const entry of await readdir(this.imageDir, { withFileTypes: true })) {
            if (!entry.isDirectory() || invalidName(entry.name, '分类名')) continue
            const meta = this.meta.categories[entry.name] ?? {}
            const category: Category = {
                name: entry.name,
                description: meta.description ?? '',
                exposed: meta.exposed ?? true,
                images: new Map(),
            }
            for (const item of await readdir(join(this.imageDir, entry.name), { withFileTypes: true })) {
                const mime = mimeOfName(item.name)
                if (!item.isFile() || !mime || invalidName(item.name, '文件名')) continue
                const path = join(this.imageDir, entry.name, item.name)
                const info = await stat(path)
                const cached = this.meta.hashes[`${entry.name}/${item.name}`]
                const hash = cached && cached.size === info.size && cached.mtime === info.mtimeMs
                    ? cached.hash
                    : hashOf(await readFile(path))
                category.images.set(item.name, { file: item.name, size: info.size, mime, hash, mtime: info.mtimeMs })
            }
            categories.set(category.name, category)
        }
        this.categories = categories
        this.bags.clear()
    }
}
