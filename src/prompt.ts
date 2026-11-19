import type { Context, Disposable } from 'cordis'
import type { Agent } from '@chatluna/agent'
import type {} from '@chatluna/prompt'
import type { ImageLibrary } from './library'
import { renderPrompt } from './utils'

/**
 * 给每个 Agent 注册一个 context 区提示词块，列出可见分类和图片路径，Bot 用内置的 `<img src>` 发图。
 * context 区每轮渲染、内容变化才重发；渲染为空时不注入。插件加载前已打开的 Agent 也补上，
 * 关闭的 Agent 从表中移除，插件卸载时撤回全部提示词块。
 */
export function registerPrompt(ctx: Context, library: ImageLibrary, fileLimit: number) {
    const blocks = new Map<Agent, Disposable>()
    const attach = (agent: Agent) => {
        if (blocks.has(agent)) return
        blocks.set(agent, agent.ctx.prompt.block({
            id: 'image-host',
            zone: 'context',
            content: () => renderPrompt(library.prompt, library.view(), fileLimit, library.imageDir),
        }))
    }
    for (const agent of ctx.agents.list()) attach(agent)
    ctx.on('chatluna/agent-open', ({ agent }) => attach(agent))
    ctx.on('chatluna/agent-close', ({ agent }) => blocks.delete(agent))
    ctx.effect(() => () => {
        for (const dispose of blocks.values()) dispose()
        blocks.clear()
    })
}
