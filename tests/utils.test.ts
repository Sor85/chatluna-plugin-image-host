import { describe, expect, it } from 'vitest'
import { DEFAULT_PROMPT, invalidName, mimeOfName, normalizeFileName, publicImageUrl, renderPrompt, sniffImage, uniqueFileName } from '../src/utils'
import type { CategoryView } from '../src/types'
import { jpeg, png } from './fixtures'

describe('names', () => {
    it('accepts Chinese names and rejects path or command separators', () => {
        expect(invalidName('猫猫', '分类名')).toBeUndefined()
        expect(invalidName('cat.v2', '分类名')).toBeUndefined()
        for (const name of ['', 'a/b', 'a b', 'a\\b', '.hidden', '-opt', 'a<b', 'a&b', 'x'.repeat(65)]) {
            expect(invalidName(name, '分类名')).toBeTypeOf('string')
        }
    })

    it('normalizes upload names and keeps the real extension', () => {
        expect(normalizeFileName('我的 图片.JPG', 'image/png')).toBe('我的_图片.png')
        expect(normalizeFileName('../../etc/passwd', 'image/gif')).toBe('_.._etc_passwd.gif')
        expect(normalizeFileName('', 'image/webp')).toBe('image.webp')
    })

    it('adds a numeric suffix until the name is free', () => {
        const taken = new Set(['a.png', 'a-1.png'])
        expect(uniqueFileName('a.png', (name) => taken.has(name))).toBe('a-2.png')
        expect(uniqueFileName('b.png', (name) => taken.has(name))).toBe('b.png')
    })

    it('maps extensions to mime types', () => {
        expect(mimeOfName('a.JPEG')).toBe('image/jpeg')
        expect(mimeOfName('a.txt')).toBeUndefined()
        expect(mimeOfName('png')).toBeUndefined()
    })
})

describe('sniffImage', () => {
    it('detects formats by magic bytes', () => {
        expect(sniffImage(png(1))).toBe('image/png')
        expect(sniffImage(jpeg)).toBe('image/jpeg')
        expect(sniffImage(Buffer.from('GIF89a'))).toBe('image/gif')
        expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
        expect(sniffImage(Buffer.from('<svg></svg>'))).toBeUndefined()
    })
})

describe('renderPrompt', () => {
    const image = (file: string) => ({ file, size: 1, mime: 'image/png', hash: file, mtime: 0 })
    const categories: CategoryView[] = [
        { name: '猫猫', description: '可爱的猫', exposed: true, images: [image('a.png'), image('b.png'), image('c.png')] },
        { name: '隐藏', description: '', exposed: false, images: [image('x.png')] },
        { name: '空', description: '', exposed: true, images: [] },
    ]

    it('lists only visible categories that have images and expands the image URL', () => {
        const text = renderPrompt(DEFAULT_PROMPT, categories, 2, 'http://127.0.0.1:5028/image-host/raw')
        expect(text).toContain('http://127.0.0.1:5028/image-host/raw/分类名/文件名')
        expect(text).toContain('「http://127.0.0.1:5028/image-host/raw/分类名」随机')
        expect(text).not.toContain('<img')
        expect(text).toContain('- 猫猫（3 张）：可爱的猫\n  a.png、b.png 等 3 张')
        expect(text).not.toContain('隐藏')
        expect(text).not.toContain('- 空')
        expect(text).not.toMatch(/\{(url|categories)\}/)
    })

    it('builds the public image URL from the server address', () => {
        expect(publicImageUrl('http://192.168.1.2:5028/')).toBe('http://192.168.1.2:5028/image-host/raw')
        expect(publicImageUrl('https://bot.example.com/chatluna')).toBe('https://bot.example.com/chatluna/image-host/raw')
    })

    it('omits file names when the limit is zero', () => {
        expect(renderPrompt('{categories}', categories, 0, '/d')).toBe('- 猫猫（3 张）：可爱的猫')
    })

    it('injects nothing when no category is usable', () => {
        expect(renderPrompt(DEFAULT_PROMPT, categories.slice(1), 5, '/d')).toBe('')
    })
})
