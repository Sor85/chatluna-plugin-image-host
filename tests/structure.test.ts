import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')

function agentFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (['node_modules', 'lib', 'dist', '.git', 'tmp'].includes(entry.name)) return []
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return agentFiles(path)
        return entry.name === 'AGENTS.md' && dir !== root ? [relative(root, path)] : []
    })
}

describe('AGENTS.md registry', () => {
    const listed = [...readFileSync(join(root, 'AGENTS.md'), 'utf8').matchAll(/^- `([^`]+\/AGENTS\.md)`/gmu)].map((match) => match[1])

    it('registers every subdirectory note in the root list', () => {
        expect(listed.sort()).toEqual(agentFiles(root).sort())
    })

    it('lists only existing files', () => {
        for (const path of listed) expect(existsSync(join(root, path!))).toBe(true)
    })
})
