import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from 'cordis'
import type { ChatFileBlock, ChatMessage } from '@chatluna/message'
import type { ToolCallContext, ToolDefinition } from '@chatluna/tool'
import { fileRefTableOf } from '@chatluna/transform'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ImageLibrary } from '../src/library'
import { registerTool, TOOL_NAME } from '../src/tool'
import { png, upload } from './fixtures'

const MB = 1024 * 1024
const URL = 'http://192.168.1.2:5028/image-host/raw'

let root: string
let library: ImageLibrary
let tools: Map<string, ToolDefinition<any>>
let stored: Map<string, Buffer>

/** 只实现工具注册用到的 `tools.define`、`effect` 与 `get('chatluna_storage')`。 */
function fakeContext() {
    return {
        tools: {
            define(definition: ToolDefinition<any>) {
                if (tools.has(definition.name)) throw new Error(`duplicate tool name: ${definition.name}`)
                tools.set(definition.name, definition)
                return () => void tools.delete(definition.name)
            },
        },
        effect: (execute: () => unknown) => execute(),
        get: (name: string) => (name === 'chatluna_storage'
            ? { readFile: async (id: string) => (stored.has(id) ? { buffer: stored.get(id)! } : null) }
            : undefined),
    } as unknown as Context
}

const image = (data: ChatFileBlock['data']): ChatFileBlock => ({ type: 'file', mediaType: 'image/png', data })

function call(blocks: ChatFileBlock[]) {
    const messages = [{ role: 'user', content: blocks }] as unknown as ChatMessage[]
    const table = fileRefTableOf(messages)
    return {
        refs: blocks.map((block) => table.refOf(block)),
        context: { agent: { session: { messages: () => messages } } } as unknown as ToolCallContext,
    }
}

const tool = () => tools.get(TOOL_NAME)!

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'image-host-tool-'))
    library = new ImageLibrary(root, () => {})
    await library.load()
    tools = new Map()
    stored = new Map()
})

afterEach(() => rm(root, { recursive: true, force: true }))

describe('image_host_save', () => {
    it('is offered only while enabled and some category is visible, listing those categories', async () => {
        registerTool(fakeContext(), library, () => URL)
        expect(tools.size).toBe(0)
        await library.createCategory('猫猫', '可爱的猫')
        await library.createCategory('隐藏')
        await library.updateCategory('隐藏', { exposed: false })
        expect(tool().args.dict!.category!.meta.description).toBe('Target category: 猫猫 (可爱的猫).')
        expect(() => tool().args({ ref: 'i1', category: '隐藏', name: 'x' })).toThrow()
        await library.setSettings({ botSave: false })
        expect(tools.size).toBe(0)
        await library.setSettings({ botSave: true })
        expect(tools.size).toBe(1)
    })

    it('saves stored and inline images from the conversation', async () => {
        await library.createCategory('猫猫')
        await library.upload('猫猫', [upload('a.png', png(1))], MB)
        registerTool(fakeContext(), library, () => URL)
        stored.set('abc', png(2))
        const { refs, context } = call([
            image({ type: 'reference', reference: 'storage://abc' }),
            image({ type: 'data', data: `data:image/png;base64,${png(1).toString('base64')}` }),
            image({ type: 'reference', reference: 'storage://gone' }),
            image({ type: 'url', url: 'https://example.com/a.png' }),
        ])
        expect(await tool().run!({ ref: refs[0], category: '猫猫', name: 'a' }, context)).toBe(`已存入分类「猫猫」：a-1.png，图片地址 ${URL}/猫猫/a-1.png`)
        expect(await tool().run!({ ref: refs[1], category: '猫猫', name: '另一张' }, context)).toBe(`分类「猫猫」已有相同图片：a.png，图片地址 ${URL}/猫猫/a.png`)
        await expect(tool().run!({ ref: refs[2], category: '猫猫', name: 'b' }, context)).rejects.toThrow('原图已过期')
        await expect(tool().run!({ ref: refs[3], category: '猫猫', name: 'b' }, context)).rejects.toThrow('没有保存')
        await expect(tool().run!({ ref: 'i000000', category: '猫猫', name: 'b' }, context)).rejects.toThrow('对话中没有')
    })

    it('keeps dots in names and hides the direct URL of random-only categories', async () => {
        await library.createCategory('猫猫')
        await library.updateCategory('猫猫', { randomOnly: true })
        registerTool(fakeContext(), library, () => URL)
        stored.set('abc', png(3))
        const { refs, context } = call([image({ type: 'reference', reference: 'storage://abc' })])
        expect(await tool().run!({ ref: refs[0], category: '猫猫', name: 'v1.5' }, context)).toBe('已存入分类「猫猫」：v1.5.png')
    })
})
