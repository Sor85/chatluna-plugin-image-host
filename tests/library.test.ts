import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageLibrary } from '../src/library'
import { DEFAULT_PROMPT, DEFAULT_SETTINGS } from '../src/utils'
import { jpeg, png, upload } from './fixtures'

const MB = 1024 * 1024

let root: string
let changed: ReturnType<typeof vi.fn>
let library: ImageLibrary

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'image-host-'))
    changed = vi.fn()
    library = new ImageLibrary(root, changed)
    await library.load()
})

afterEach(() => rm(root, { recursive: true, force: true }))

const files = (name: string) => library.view().find((category) => category.name === name)?.images.map((image) => image.file)

describe('categories', () => {
    it('creates, renames and deletes category folders', async () => {
        await library.createCategory('猫猫', '可爱')
        await expect(library.createCategory('猫猫')).rejects.toThrow('分类已存在')
        await expect(library.createCategory('a/b')).rejects.toThrow('分类名')
        await library.upload('猫猫', [upload('a.png', png(1))], MB)
        await library.updateCategory('猫猫', { rename: 'cats', description: '猫', exposed: false })
        expect(library.view()).toMatchObject([{ name: 'cats', description: '猫', exposed: false, images: [{ file: 'a.png' }] }])
        expect(await readFile(join(root, 'images/cats/a.png'))).toEqual(png(1))
        await library.deleteCategory('cats')
        expect(library.view()).toEqual([])
        expect(changed).toHaveBeenCalled()
    })

    it('finds categories and images ignoring case and extension', async () => {
        await library.createCategory('Cats')
        await library.upload('Cats', [upload('Tom.png', png(1))], MB)
        const category = library.find('cats')!
        expect(category.name).toBe('Cats')
        expect(library.image(category, 'tom.PNG')?.file).toBe('Tom.png')
        expect(library.image(category, 'tom')?.file).toBe('Tom.png')
        expect(library.image(category, 'jerry')).toBeUndefined()
    })

    it('persists descriptions, visibility and the prompt template', async () => {
        await library.createCategory('猫猫', '可爱')
        await library.updateCategory('猫猫', { exposed: false })
        await library.setPrompt('自定义 {categories}')
        const reloaded = new ImageLibrary(root, () => {})
        await reloaded.load()
        expect(reloaded.view()).toMatchObject([{ name: '猫猫', description: '可爱', exposed: false }])
        expect(reloaded.prompt).toBe('自定义 {categories}')
        await reloaded.setPrompt(undefined)
        expect(reloaded.prompt).toBe(DEFAULT_PROMPT)
    })
})

describe('settings', () => {
    it('stores only values that differ from the defaults and normalizes the address', async () => {
        expect(library.settings).toEqual(DEFAULT_SETTINGS)
        await library.setSettings({ maxFileSize: 5, baseUrl: ' http://192.168.1.2:5028/ ' })
        await library.setSettings({ injectPrompt: DEFAULT_SETTINGS.injectPrompt })
        expect(JSON.parse(await readFile(join(root, 'meta.json'), 'utf8')).settings).toEqual({ maxFileSize: 5, baseUrl: 'http://192.168.1.2:5028' })
        const reloaded = new ImageLibrary(root, () => {})
        await reloaded.load()
        expect(reloaded.settings).toEqual({ ...DEFAULT_SETTINGS, maxFileSize: 5, baseUrl: 'http://192.168.1.2:5028' })
        await reloaded.setSettings(DEFAULT_SETTINGS)
        expect(JSON.parse(await readFile(join(root, 'meta.json'), 'utf8')).settings).toBeUndefined()
    })

    it('ignores settings removed in newer versions', async () => {
        const meta = JSON.parse(await readFile(join(root, 'meta.json'), 'utf8'))
        await writeFile(join(root, 'meta.json'), JSON.stringify({ ...meta, settings: { promptFileLimit: 5, maxFileSize: 3 } }))
        const reloaded = new ImageLibrary(root, () => {})
        await reloaded.load()
        expect(reloaded.settings).toEqual({ ...DEFAULT_SETTINGS, maxFileSize: 3 })
        await reloaded.setSettings({})
        expect(JSON.parse(await readFile(join(root, 'meta.json'), 'utf8')).settings).toEqual({ maxFileSize: 3 })
    })
})

describe('visibility', () => {
    beforeEach(async () => {
        await library.createCategory('猫猫')
        await library.upload('猫猫', [1, 2, 3].map((n) => upload(`${n}.png`, png(n))), MB)
    })

    it('persists random-only categories and hidden images across renames and moves', async () => {
        await library.updateCategory('猫猫', { randomOnly: true })
        await library.setImagesExposed('猫猫', ['2.png'], false)
        await library.moveImage('猫猫', '2.png', { file: 'two.png' })
        await library.updateCategory('猫猫', { rename: 'cats' })
        const reloaded = new ImageLibrary(root, () => {})
        await reloaded.load()
        const [category] = reloaded.view()
        expect(category).toMatchObject({ name: 'cats', randomOnly: true })
        expect(Object.fromEntries(category!.images.map((image) => [image.file, image.exposed]))).toEqual({ '1.png': true, 'two.png': false, '3.png': true })
        await reloaded.setImagesExposed('cats', ['two.png'], true)
        await reloaded.updateCategory('cats', { randomOnly: false })
        expect(JSON.parse(await readFile(join(root, 'meta.json'), 'utf8')).categories).toEqual({ cats: {} })
        await expect(reloaded.setImagesExposed('cats', ['missing.png'], false)).rejects.toThrow('图片不存在')
    })

    it('never picks hidden images and picks them again once shown', async () => {
        const category = library.find('猫猫')!
        library.pick(category)
        await library.setImagesExposed('猫猫', ['1.png', '2.png'], false)
        expect(new Set(Array.from({ length: 6 }, () => library.pick(category)!.file))).toEqual(new Set(['3.png']))
        await library.setImagesExposed('猫猫', ['3.png'], false)
        expect(library.pick(category)).toBeUndefined()
        await library.setImagesExposed('猫猫', ['1.png'], true)
        expect(library.pick(category)!.file).toBe('1.png')
    })
})

describe('upload', () => {
    beforeEach(() => library.createCategory('猫猫'))

    it('skips content already in the category and renames names clashing within the request', async () => {
        const first = await library.upload('猫猫', [upload('a.png', png(1)), upload('a.png', png(2)), upload('copy.png', png(1))], MB)
        expect(first).toEqual({ added: ['a.png', 'a-1.png'], replaced: [], duplicates: [{ name: 'copy.png', existing: 'a.png' }], errors: [], conflicts: [] })
        const second = await library.upload('猫猫', [upload('again.png', png(2))], MB)
        expect(second.duplicates).toEqual([{ name: 'again.png', existing: 'a-1.png' }])
    })

    it('reports names clashing with existing images until told to overwrite or rename', async () => {
        await library.upload('猫猫', [upload('A.png', png(1))], MB)
        await library.setImagesExposed('猫猫', ['A.png'], false)
        const asked = await library.upload('猫猫', [upload('new.png', png(3)), upload('a.png', png(2))], MB)
        expect(asked.added).toEqual(['new.png'])
        expect(asked.conflicts).toEqual([{ index: 1, name: 'a.png', existing: 'A.png' }])
        const original = library.find('猫猫')!.images.get('A.png')!.hash

        const replaced = await library.upload('猫猫', [upload('a.png', png(2))], MB, 'overwrite')
        expect(replaced).toMatchObject({ added: [], replaced: ['A.png'], conflicts: [] })
        const image = library.find('猫猫')!.images.get('A.png')!
        expect(image.hash).not.toBe(original)
        expect(image.exposed).toBe(false)
        expect(await readFile(join(library.imageDir, '猫猫', 'A.png'))).toEqual(png(2))
        // 被覆盖掉的旧内容不再算作重复。
        expect((await library.upload('猫猫', [upload('old.png', png(1))], MB)).added).toEqual(['old.png'])

        const renamed = await library.upload('猫猫', [upload('a.png', png(4))], MB, 'rename')
        expect(renamed).toMatchObject({ added: ['a-1.png'], replaced: [], conflicts: [] })
    })

    it('rejects non-images, empty and oversized files and fixes extensions', async () => {
        const result = await library.upload('猫猫', [
            upload('fake.png', Buffer.from('<svg/>')),
            upload('empty.png', Buffer.alloc(0)),
            upload('big.png', png(3)),
            upload('photo.png', jpeg),
        ], png(3).length - 1)
        expect(result.added).toEqual(['photo.jpg'])
        expect(result.errors.map((error) => error.name)).toEqual(['fake.png', 'empty.png', 'big.png'])
    })
})

describe('pick', () => {
    it('sends every image once per round without repeating across rounds', async () => {
        await library.createCategory('猫猫')
        await library.upload('猫猫', [1, 2, 3, 4].map((n) => upload(`${n}.png`, png(n))), MB)
        const category = library.find('猫猫')!
        const picks = Array.from({ length: 40 }, () => library.pick(category)!.file)
        for (let round = 0; round < 10; round++) {
            expect(new Set(picks.slice(round * 4, round * 4 + 4)).size).toBe(4)
        }
        for (let index = 1; index < picks.length; index++) expect(picks[index]).not.toBe(picks[index - 1])
    })

    it('returns nothing for an empty category', async () => {
        await library.createCategory('空')
        expect(library.pick(library.find('空')!)).toBeUndefined()
    })
})

describe('move and delete', () => {
    beforeEach(async () => {
        await library.createCategory('a')
        await library.createCategory('b')
        await library.upload('a', [upload('x.png', png(1)), upload('y.png', png(2))], MB)
        await library.upload('b', [upload('z.png', png(2))], MB)
    })

    it('renames within a category and keeps the extension', async () => {
        await library.moveImage('a', 'x.png', { file: 'renamed.png' })
        expect(files('a')).toEqual(['renamed.png', 'y.png'])
        await expect(library.moveImage('a', 'y.png', { file: 'y.jpg' })).rejects.toThrow('扩展名')
        await expect(library.moveImage('a', 'y.png', { file: 'renamed.png' })).rejects.toThrow('文件已存在')
    })

    it('refuses to move content the target category already has', async () => {
        await expect(library.moveImage('a', 'y.png', { category: 'b' })).rejects.toThrow('已有相同图片')
        await library.moveImage('a', 'x.png', { category: 'b' })
        expect(files('a')).toEqual(['y.png'])
        expect(files('b')).toEqual(['x.png', 'z.png'])
    })

    it('deletes images from disk', async () => {
        await library.deleteImages('a', ['x.png'])
        expect(files('a')).toEqual(['y.png'])
        await expect(readFile(join(root, 'images/a/x.png'))).rejects.toThrow()
    })
})

describe('rescan and dedupe', () => {
    it('picks up files copied into the folder and removes duplicates, keeping the oldest', async () => {
        await mkdir(join(root, 'images/表情'), { recursive: true })
        await writeFile(join(root, 'images/表情/1.png'), png(1))
        await new Promise((resolve) => setTimeout(resolve, 20))
        await writeFile(join(root, 'images/表情/2.png'), png(1))
        await writeFile(join(root, 'images/表情/3.png'), png(2))
        await writeFile(join(root, 'images/表情/notes.txt'), 'ignored')
        await mkdir(join(root, 'images/.hidden'))
        await library.rescan()
        expect(library.view().map((category) => category.name)).toEqual(['表情'])
        expect(files('表情')).toEqual(['1.png', '2.png', '3.png'])
        expect(await library.dedupe()).toEqual({ removed: [{ category: '表情', file: '2.png', kept: '1.png' }] })
        expect(files('表情')).toEqual(['1.png', '3.png'])
        expect(await library.dedupe('表情')).toEqual({ removed: [] })
    })

    it('reuses cached hashes for unchanged files', async () => {
        await library.createCategory('a')
        await library.upload('a', [upload('x.png', png(1))], MB)
        const meta = JSON.parse(await readFile(join(root, 'meta.json'), 'utf8'))
        meta.hashes['a/x.png'].hash = 'cached'
        await writeFile(join(root, 'meta.json'), JSON.stringify(meta))
        const reloaded = new ImageLibrary(root, () => {})
        await reloaded.load()
        expect(reloaded.view()[0]!.images[0]!.hash).toBe('cached')
    })
})
