#!/usr/bin/env node
// 用 onebot-sandbox 的隔离测试空间验收图床插件的聊天指令和 Bot 发图。
//
// 前提：宿主已加载本插件，IMAGE_HOST_CATEGORY 指定的分类对 Bot 可见，且至少有 3 张大小互不相同的图片。
// 环境变量：
//   ONEBOT_SANDBOX_TOKEN   沙盒测试凭据（需要 read、interact、manage、debug 范围），必填
//   ONEBOT_SANDBOX_URL     默认 http://127.0.0.1:61901
//   IMAGE_HOST_DATA_DIR    插件数据目录，用于读取测试图片大小，必填
//   IMAGE_HOST_CATEGORY    测试分类名，必填
//   IMAGE_HOST_PREFIX      指令前缀，默认 /
//   IMAGE_HOST_SKIP_LLM    设为 1 时跳过需要模型的 Bot 发图用例
//   IMAGE_HOST_SANDBOX_REPORT  报告输出路径（权限 600），可选
import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.ONEBOT_SANDBOX_URL ?? 'http://127.0.0.1:61901'
const token = process.env.ONEBOT_SANDBOX_TOKEN
const dataDir = process.env.IMAGE_HOST_DATA_DIR
const category = process.env.IMAGE_HOST_CATEGORY
const prefix = process.env.IMAGE_HOST_PREFIX ?? '/'
if (!token || !dataDir || !category) throw new Error('需要 ONEBOT_SANDBOX_TOKEN、IMAGE_HOST_DATA_DIR 和 IMAGE_HOST_CATEGORY 环境变量')

const folder = path.join(dataDir, 'images', category)
const files = await Promise.all((await readdir(folder)).filter((file) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(file)).map(async (file) => ({ file, size: (await stat(path.join(folder, file))).size })))
assert.ok(files.length >= 3, '测试分类至少需要 3 张图片')
assert.equal(new Set(files.map((item) => item.size)).size, files.length, '测试图片大小需互不相同，用于识别发出的是哪一张')
const nameOf = (size) => files.find((item) => item.size === size)?.file

const runId = `image-host-${randomUUID()}`
const bot = String(randomInt(820000000, 829000000))
const owner = String(Number(bot) + 1)
const user = String(Number(bot) + 2)
const group = String(Number(bot) + 3)
const groupChat = `group:${group}`
const results = []
let spaceId
let step = 0

async function call(name, input) {
    const response = await fetch(`${endpoint}/api/v1/tools/${name}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, testRunId: runId }),
        signal: AbortSignal.timeout(200000),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status} ${body.code ?? ''} ${body.message ?? ''}`)
    return body
}

/** 发送一条消息并收集机器人的回复；timeoutSeconds 内没有回复时返回空列表。 */
async function exchange(conversationId, content, { settleSeconds = 1, timeoutSeconds = 30 } = {}) {
    const sent = await call('send_message', { spaceId, operatorId: user, conversationId, content, idempotencyKey: `${runId}:${step++}` })
    const received = await call('wait_for_message', { spaceId, cursor: sent.cursorBefore, authorId: bot, conversationId, settleSeconds, timeoutSeconds })
    if (received.outcome !== 'matched') return { messages: [], images: [], text: '' }
    const messages = [...new Map((received.events ?? [received.event]).map((event) => [event.data.id, event.data])).values()]
    const images = messages.flatMap((item) => item.media ?? []).filter((media) => media.type === 'image')
    return { messages, images, text: messages.map((item) => item.content).join('\n') }
}

function record(label, content, reply, detail) {
    results.push({ label, content, messageIds: reply.messages.map((item) => item.id), images: reply.images.map((image) => ({ size: image.size, file: nameOf(image.size) })), text: reply.text, ...detail })
    console.log(`通过：${label}${detail ? ` ${JSON.stringify(detail)}` : ''}`)
}

async function expectImage(label, conversationId, content, file) {
    const reply = await exchange(conversationId, content)
    assert.equal(reply.images.length, 1, `${label} 应返回一张图片；实际文本：${reply.text}`)
    const sent = nameOf(reply.images[0].size)
    assert.ok(sent, `${label} 返回的图片不在测试分类中（大小 ${reply.images[0].size}）`)
    if (file) assert.equal(sent, file, `${label} 应发送 ${file}`)
    record(label, content, reply, { file: sent })
    return sent
}

try {
    await call('get_server_info', {})
    const space = await call('create_test_space', { name: '图床插件验收', idempotencyKey: `${runId}:space` })
    spaceId = space.spaceId
    console.log(`隔离测试空间：${spaceId}`)
    await call('apply_environment_changes', {
        spaceId, expectedRevision: space.revision, idempotencyKey: `${runId}:environment`,
        changes: [
            { action: 'create-bot', data: { id: bot, name: '图床验收机器人' } },
            { action: 'create-user', data: { id: owner, name: '测试群主' } },
            { action: 'create-user', data: { id: user, name: '图床测试成员' } },
            { action: 'create-group', data: { id: group, name: '图床隔离验收群', members: [
                { participantId: owner, role: 'owner' }, { participantId: user, role: 'member' }, { participantId: bot, role: 'member' },
            ] } },
            { action: 'set-friendship', data: { firstId: user, secondId: bot } },
        ],
    })

    // 一轮内每张图只出现一次，换轮时不与上一张相同。洗牌袋在宿主内存中跨会话保留，起点可能在上一轮中途，
    // 所以检查是否存在偏移 k，使前 k 张互不相同且之后每 n 张恰好覆盖全部图片。
    const n = files.length
    const round = []
    for (let index = 0; index < n * 3; index++) round.push(await expectImage(`随机发图 #${index + 1}`, groupChat, `${prefix}${category}`))
    const distinct = (items) => new Set(items).size === items.length
    const aligned = Array.from({ length: n }, (_, k) => k).some((k) =>
        distinct(round.slice(0, k)) && [0, 1].every((r) => distinct(round.slice(k + r * n, k + (r + 1) * n))))
    assert.ok(aligned, `随机发图未按轮次不重复：${round.join(',')}`)
    for (let index = 1; index < round.length; index++) assert.notEqual(round[index], round[index - 1], '相邻两次随机发了同一张')
    console.log(`通过：洗牌轮转 ${round.join(' → ')}`)

    const target = files[1]
    await expectImage('指定文件', groupChat, `${prefix}${category}/${target.file}`, target.file)
    const stem = target.file.replace(/\.[^.]+$/, '').toUpperCase()
    await expectImage('省略扩展名且忽略大小写', groupChat, `${prefix}${category}/${stem}`, target.file)
    await expectImage('@机器人后发送指令', groupChat, `<at id="${bot}"/> ${prefix}${category}/${files[0].file}`, files[0].file)

    const missing = await exchange(groupChat, `${prefix}${category}/不存在的图片.png`)
    assert.equal(missing.images.length, 0)
    assert.match(missing.text, /没有图片/)
    record('不存在的文件', `${prefix}${category}/不存在的图片.png`, missing)

    const unknown = await exchange(groupChat, `${prefix}不存在的分类${bot}`, { timeoutSeconds: 8 })
    assert.equal(unknown.images.length, 0, '未知分类不应发图')
    record('未知分类交还后续处理', `${prefix}不存在的分类${bot}`, unknown)

    await expectImage('私聊随机发图', `private:${[user, bot].sort().join(':')}`, `${prefix}${category}`)

    if (process.env.IMAGE_HOST_SKIP_LLM !== '1') {
        const content = `<at id="${bot}"/> 请从图床的「${category}」分类里发一张图片给我`
        const reply = await exchange(groupChat, content, { settleSeconds: 5, timeoutSeconds: 180 })
        assert.ok(reply.images.length >= 1, `Bot 应通过 <img> 发图；实际文本：${reply.text}`)
        for (const image of reply.images) assert.ok(nameOf(image.size), 'Bot 发出的图片不在测试分类中')
        const call_ = await call('get_model_call', { spaceId, conversationId: groupChat, botId: bot })
        const request = JSON.stringify(call_)
        assert.ok(request.includes(`${category}（${files.length} 张）`), '模型请求中缺少注入的分类清单')
        assert.ok(request.includes('/image-host/raw/分类名/文件名'), '模型请求中缺少图片地址说明')
        const response = JSON.stringify(call_.response ?? call_)
        assert.match(response, /<img src=\\?"https?:\/\/[^"\\]*\/image-host\/raw\//, '模型回复中没有使用图床的 HTTP 地址')
        record('Bot 按提示词发图', content, reply, { injected: true })
    }

    const debug = await call('list_onebot_debug_records', { spaceId, botId: bot, direction: 'action', limit: 100 })
    const report = { runId, spaceId, botId: bot, category, files, passed: results.length, results, debugRecords: debug.items?.length }
    if (process.env.IMAGE_HOST_SANDBOX_REPORT) await writeFile(process.env.IMAGE_HOST_SANDBOX_REPORT, JSON.stringify(report, null, 2), { mode: 0o600 })
    console.log(`沙盒验收通过：${results.length} 项`)
} finally {
    if (spaceId) {
        const complete = await call('complete_test_space', { spaceId, idempotencyKey: `${runId}:complete` })
        assert.equal(complete.status, 'completed')
        console.log(`测试空间已完成，机器人已停止：${spaceId}`)
    }
}
