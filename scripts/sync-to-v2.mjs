#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(
    (process.argv[2] ?? process.env.CHATLUNA_V2_ROOT ?? path.join(source, '../../chatluna-v2-mirror'))
        .replaceAll('\\', '/'),
)
const target = path.join(root, 'external/image-host')
const manifest = path.join(root, 'package.json')

if (!existsSync(manifest)) throw new Error(`未找到 ChatLuna v2 仓库：${root}`)
const workspace = JSON.parse(readFileSync(manifest, 'utf8'))
if (!Array.isArray(workspace.workspaces) || !workspace.workspaces.includes('external/*')) {
    throw new Error(`目标不是包含 external/* 的 ChatLuna v2 工作区：${root}`)
}
if (existsSync(target) && realpathSync(target) === realpathSync(source)) {
    throw new Error('同步只能从独立源码目录运行，不能在开发副本内运行。')
}
const targetManifest = path.join(target, 'package.json')
if (existsSync(targetManifest)) {
    const existing = JSON.parse(readFileSync(targetManifest, 'utf8'))
    if (existing.name !== 'chatluna-plugin-image-host') {
        throw new Error(`目标目录已被其他项目占用：${target}`)
    }
}

mkdirSync(target, { recursive: true })
for (const entry of [
    'src', 'client', 'tests', 'scripts', '.agents', 'AGENTS.md', 'package.json',
    'tsconfig.json', 'tsconfig.client.json', 'tsconfig.test.json', 'vitest.config.ts', 'README.md', 'LICENSE', '.gitignore',
]) {
    cpSync(path.join(source, entry), path.join(target, entry), { recursive: true })
}
console.log(`已同步至 ${target}（保留依赖、构建产物和目标独有文件）`)
