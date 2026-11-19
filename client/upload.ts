import { toast, type Translate } from '@chatluna/ui-client/client'
import type { DedupeResult, UploadFile, UploadResult } from '../src/types'

/** 单次请求的原始体积上限，Base64 后约为 1.34 倍，避免一次请求体过大。 */
const BATCH_BYTES = 16 * 1024 * 1024
const BATCH_FILES = 20

export async function readBase64(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    return btoa(binary)
}

/** 按体积和数量把文件切成多批上传，单批失败不影响其他批次。 */
export function batches(files: readonly File[]) {
    const result: File[][] = []
    let current: File[] = []
    let size = 0
    for (const file of files) {
        if (current.length > 0 && (size + file.size > BATCH_BYTES || current.length >= BATCH_FILES)) {
            result.push(current)
            current = []
            size = 0
        }
        current.push(file)
        size += file.size
    }
    if (current.length > 0) result.push(current)
    return result
}

export async function encode(files: readonly File[]): Promise<UploadFile[]> {
    return Promise.all(files.map(async (file) => ({ name: file.name, content: await readBase64(file) })))
}

export function reportUpload(t: Translate, result: UploadResult) {
    if (result.added.length > 0) toast.success(t('image-host.upload.done', { count: result.added.length }))
    if (result.duplicates.length > 0) {
        toast.info(t('image-host.upload.duplicates', { count: result.duplicates.length }), {
            description: result.duplicates.map((item) => `${item.name} → ${item.existing}`).join('\n'),
        })
    }
    for (const error of result.errors) toast.error(t('image-host.upload.failedOne', { name: error.name }), { description: error.message })
}

export function reportDedupe(t: Translate, result: DedupeResult) {
    if (result.removed.length === 0) {
        toast.success(t('image-host.dedupe.none'))
        return
    }
    toast.success(t('image-host.dedupe.done', { count: result.removed.length }), {
        description: result.removed.map((item) => `${item.category}/${item.file} = ${item.kept}`).join('\n'),
    })
}

export function formatSize(size: number) {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / 1024 / 1024).toFixed(1)} MB`
}
