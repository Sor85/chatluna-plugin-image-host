import * as React from 'react'
import {
    Badge,
    Button,
    ButtonLabel,
    Checkbox,
    CodeValue,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    EmptyState,
    FilterChips,
    Label,
    matchesQuery,
    Progress,
    ProgressLabel,
    ProgressValue,
    SearchBox,
    Spinner,
    Switch,
    cn,
    useCopyText,
} from '@chatluna/ui-kit'
import {
    CopyIcon,
    EyeIcon,
    EyeOffIcon,
    FolderInputIcon,
    MoreHorizontalIcon,
    PencilIcon,
    PlusIcon,
    ShuffleIcon,
    SparklesIcon,
    Trash2Icon,
    UploadIcon,
    XIcon,
    ZoomInIcon,
} from 'lucide-react'
import { apiBase, apiErrorMessage, toast, useAction, type Translate } from '@chatluna/ui-client/client'
import type { CategoryView, ImageEntry, LibraryView, UploadResult } from '../src/types'
import { useT } from './i18n'
import { CategoryDialog, ConfirmDialog, MoveDialog, PreviewDialog } from './dialogs'
import { batches, encode, formatSize, reportDedupe, reportUpload } from './upload'

export function imageUrl(library: LibraryView, category: string, image: ImageEntry) {
    return `${apiBase()}${library.fileRoute}/${encodeURIComponent(category)}/${encodeURIComponent(image.file)}?v=${image.hash.slice(0, 16)}`
}

type Sort = 'name' | 'newest' | 'size'

const compare: Record<Sort, (a: ImageEntry, b: ImageEntry) => number> = {
    name: (a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }),
    newest: (a, b) => b.mtime - a.mtime,
    size: (a, b) => b.size - a.size,
}

/** 有弹窗打开时，粘贴和 Esc 交给弹窗处理。 */
const dialogOpen = () => document.querySelector('[role="dialog"], [role="alertdialog"]') !== null

export function Gallery({ library, selected, onSelect, onCreate }: {
    library: LibraryView
    selected?: string
    onSelect(name?: string): void
    onCreate(): void
}) {
    const t = useT()
    const current = library.categories.find((item) => item.name === selected) ?? library.categories[0]
    if (!current) {
        return (
            <EmptyState
                title={t('image-host.empty.title')}
                hint={t('image-host.empty.hint')}
                actions={(
                    <Button size="sm" onClick={onCreate}>
                        <PlusIcon />
                        {t('image-host.category.create')}
                    </Button>
                )}
            />
        )
    }
    return (
        <div className="grid items-start gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
            {/* 窄屏时分类换行排列在内容上方，不占满整列。 */}
            <nav aria-label={t('image-host.category.list')} className="flex flex-wrap gap-1 md:sticky md:top-(--page-header-height) md:flex-col md:flex-nowrap md:gap-0.5">
                {library.categories.map((category) => (
                    <Button
                        key={category.name}
                        variant="ghost"
                        aria-current={category === current ? 'page' : undefined}
                        className={cn('max-w-full justify-start gap-2 md:w-full', category === current && 'bg-foreground/6')}
                        onClick={() => onSelect(category.name)}
                    >
                        <span className="min-w-0 truncate text-left md:flex-1">{category.name}</span>
                        {category.randomOnly && <ShuffleIcon className="text-muted-foreground" aria-label={t('image-host.category.randomOnly')} />}
                        {!category.exposed && <EyeOffIcon className="text-muted-foreground" aria-label={t('image-host.category.hidden')} />}
                        <span className="text-xs text-muted-foreground tabular-nums">{category.images.length}</span>
                    </Button>
                ))}
            </nav>
            <CategoryPanel key={current.name} library={library} category={current} onSelect={onSelect} />
        </div>
    )
}

function CategoryPanel({ library, category, onSelect }: {
    library: LibraryView
    category: CategoryView
    onSelect(name?: string): void
}) {
    const t = useT()
    const [search, setSearch] = React.useState('')
    const [sort, setSort] = React.useState<Sort>('name')
    const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set())
    const [editing, setEditing] = React.useState(false)
    const [removing, setRemoving] = React.useState(false)
    const [previewing, setPreviewing] = React.useState<string>()
    const [moving, setMoving] = React.useState<ImageEntry>()
    const [deleting, setDeleting] = React.useState<string[]>()
    const [dragging, setDragging] = React.useState(false)
    const [progress, setProgress] = React.useState<{ done: number, total: number }>()
    const fileInput = React.useRef<HTMLInputElement>(null)
    const busy = React.useRef(false)
    const [copy, manualCopy] = useCopyText()

    const update = useAction('image-host.category.update', {
        onError: (error) => toast.error(t('image-host.category.updateFailed'), { description: apiErrorMessage(error) }),
    })
    const remove = useAction('image-host.category.delete', {
        onSuccess: () => {
            toast.success(t('image-host.category.deleted', { name: category.name }))
            setRemoving(false)
            onSelect()
        },
        onError: (error) => toast.error(t('image-host.category.deleteFailed'), { description: apiErrorMessage(error) }),
    })
    const upload = useAction('image-host.image.upload', {
        onError: (error) => toast.error(t('image-host.upload.failed'), { description: apiErrorMessage(error) }),
    })
    const dedupe = useAction('image-host.dedupe', {
        onSuccess: (result) => reportDedupe(t, result),
        onError: (error) => toast.error(t('image-host.dedupe.failed'), { description: apiErrorMessage(error) }),
    })
    const expose = useAction('image-host.image.expose', {
        onError: (error) => toast.error(t('image-host.image.exposeFailed'), { description: apiErrorMessage(error) }),
    })
    const deleteImages = useAction('image-host.image.delete', {
        onSuccess: () => {
            setDeleting(undefined)
            setPicked(new Set())
        },
        onError: (error) => toast.error(t('image-host.image.deleteFailed'), { description: apiErrorMessage(error) }),
    })

    const send = async (files: File[]) => {
        if (busy.current) {
            toast.info(t('image-host.upload.busy'))
            return
        }
        const maxFileSize = library.settings.maxFileSize * 1024 * 1024
        const accepted = files.filter((file) => file.size <= maxFileSize)
        for (const file of files) {
            if (file.size > maxFileSize) toast.error(t('image-host.upload.failedOne', { name: file.name }), { description: t('image-host.upload.tooLarge', { size: formatSize(maxFileSize) }) })
        }
        if (accepted.length === 0) return
        busy.current = true
        setProgress({ done: 0, total: accepted.length })
        const total: UploadResult = { added: [], duplicates: [], errors: [] }
        try {
            for (const batch of batches(accepted)) {
                const result = await upload({ category: category.name, files: await encode(batch) })
                setProgress((current) => current && { ...current, done: current.done + batch.length })
                if (!result) continue
                total.added.push(...result.added)
                total.duplicates.push(...result.duplicates)
                total.errors.push(...result.errors)
            }
        } finally {
            busy.current = false
            setProgress(undefined)
        }
        reportUpload(t, total)
    }
    // 监听器只注册一次，通过 ref 调用最新的 send。
    const latestSend = React.useRef(send)
    latestSend.current = send
    React.useEffect(() => {
        const paste = (event: ClipboardEvent) => {
            if (dialogOpen()) return
            const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'))
            if (files.length === 0) return
            event.preventDefault()
            void latestSend.current(files)
        }
        document.addEventListener('paste', paste)
        return () => document.removeEventListener('paste', paste)
    }, [])

    const images = React.useMemo(
        () => category.images.filter((image) => matchesQuery(search, image.file)).sort(compare[sort]),
        [category.images, search, sort],
    )
    // 已删除或改名的图片自然不在列表中，所选项只取仍存在的文件。
    const selection = category.images.filter((image) => picked.has(image.file))
    const selecting = selection.length > 0
    const allPicked = images.length > 0 && images.every((image) => picked.has(image.file))
    const toggle = (file: string) => setPicked((current) => {
        const next = new Set(current)
        if (!next.delete(file)) next.add(file)
        return next
    })
    const clearPicked = () => setPicked(new Set())
    React.useEffect(() => {
        if (!selecting) return
        const escape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented || dialogOpen()) return
            setPicked(new Set())
        }
        window.addEventListener('keydown', escape)
        return () => window.removeEventListener('keydown', escape)
    }, [selecting])

    const copyAddress = async (text: string) => {
        if (await copy(text)) toast.success(t('image-host.copied', { text }))
    }
    const setExposed = (files: string[], exposed: boolean) => void expose({ category: category.name, files, exposed })
    // 隐藏分类不提供公开地址；「只能随机」的分类和隐藏图片没有指定地址。
    const random = category.exposed && library.imageUrl ? `${library.imageUrl}/${category.name}` : undefined
    const address = (image: ImageEntry) => (random && !category.randomOnly && image.exposed ? `${random}/${image.file}` : undefined)
    const hiddenCount = category.images.filter((image) => !image.exposed).length
    const totalSize = category.images.reduce((sum, image) => sum + image.size, 0)
    const previewIndex = previewing === undefined ? -1 : images.findIndex((image) => image.file === previewing)
    const uploadButton = (
        <Button size="sm" disabled={progress !== undefined} onClick={() => fileInput.current?.click()}>
            {progress ? <Spinner /> : <UploadIcon />}
            <ButtonLabel>{t('image-host.upload.action')}</ButtonLabel>
        </Button>
    )

    return (
        <section
            aria-label={category.name}
            className="relative min-w-0 space-y-4"
            onDragOver={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return
                event.preventDefault()
                setDragging(true)
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) setDragging(false)
            }}
            onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                void send([...event.dataTransfer.files])
            }}
        >
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-48 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold">{category.name}</h2>
                        <Badge variant="secondary" className="tabular-nums">
                            {t('image-host.category.summary', { count: category.images.length, size: formatSize(totalSize) })}
                        </Badge>
                        {hiddenCount > 0 && <Badge variant="outline">{t('image-host.image.hiddenCount', { count: hiddenCount })}</Badge>}
                    </div>
                    <p className="text-muted-foreground">{category.description || t('image-host.category.noDescription')}</p>
                </div>
                <div className="flex items-center gap-2">
                    {uploadButton}
                    <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label={t('image-host.category.actions', { name: category.name })} />}>
                            <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setEditing(true)}>
                                <PencilIcon />
                                {t('image-host.category.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={dedupe.pending} onClick={() => void dedupe({ category: category.name })}>
                                <SparklesIcon />
                                {t('image-host.dedupe.action')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setRemoving(true)}>
                                <Trash2Icon />
                                {t('image-host.category.delete')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <input
                        ref={fileInput}
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
                        className="hidden"
                        onChange={(event) => {
                            const files = [...(event.target.files ?? [])]
                            event.target.value = ''
                            if (files.length > 0) void send(files)
                        }}
                    />
                </div>
            </div>
            <AccessBar
                t={t}
                category={category}
                random={random}
                hasServer={library.imageUrl !== ''}
                pending={update.pending}
                onChange={(patch) => void update({ name: category.name, ...patch })}
            />
            {progress !== undefined && (
                <Progress value={progress.total === 0 ? 0 : (progress.done / progress.total) * 100} className="gap-1.5">
                    <ProgressLabel className="text-xs font-normal text-muted-foreground">{t('image-host.upload.progress')}</ProgressLabel>
                    <ProgressValue className="text-xs">{() => `${progress.done} / ${progress.total}`}</ProgressValue>
                </Progress>
            )}
            {category.images.length > 0 && (
                <div className="flex min-h-8 flex-wrap items-center gap-2">
                    {selecting ? (
                        <>
                            <span className="font-medium tabular-nums">{t('image-host.image.selected', { count: selection.length })}</span>
                            <Button variant="ghost" size="sm" onClick={() => setPicked(allPicked ? new Set() : new Set(images.map((image) => image.file)))}>
                                {t(allPicked ? 'image-host.image.selectNone' : 'image-host.image.selectAll')}
                            </Button>
                            <div className="ml-auto flex flex-wrap items-center gap-2">
                                {selection.some((image) => image.exposed) && (
                                    <Button variant="outline" size="sm" disabled={expose.pending} onClick={() => setExposed(selection.filter((image) => image.exposed).map((image) => image.file), false)}>
                                        <EyeOffIcon />
                                        <ButtonLabel>{t('image-host.image.hide')}</ButtonLabel>
                                    </Button>
                                )}
                                {selection.some((image) => !image.exposed) && (
                                    <Button variant="outline" size="sm" disabled={expose.pending} onClick={() => setExposed(selection.filter((image) => !image.exposed).map((image) => image.file), true)}>
                                        <EyeIcon />
                                        <ButtonLabel>{t('image-host.image.show')}</ButtonLabel>
                                    </Button>
                                )}
                                <Button variant="destructive" size="sm" onClick={() => setDeleting(selection.map((image) => image.file))}>
                                    <Trash2Icon />
                                    <ButtonLabel>{t('image-host.image.deleteSelected')}</ButtonLabel>
                                </Button>
                                <Button variant="ghost" size="icon-sm" aria-label={t('image-host.image.clearSelection')} onClick={clearPicked}>
                                    <XIcon />
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <SearchBox value={search} onChange={setSearch} placeholder={t('image-host.image.search')} clearLabel={t('image-host.image.searchClear')} />
                            <FilterChips<Sort>
                                label={t('image-host.sort.label')}
                                value={sort}
                                onChange={setSort}
                                options={[
                                    { value: 'name', label: t('image-host.sort.name') },
                                    { value: 'newest', label: t('image-host.sort.newest') },
                                    { value: 'size', label: t('image-host.sort.size') },
                                ]}
                            />
                            <span className="ml-auto text-xs text-muted-foreground max-sm:hidden">{t('image-host.usage.drop')}</span>
                        </>
                    )}
                </div>
            )}
            {category.images.length === 0 ? (
                <EmptyState title={t('image-host.image.empty')} hint={t('image-host.image.emptyHint')} actions={uploadButton} />
            ) : images.length === 0 ? (
                <EmptyState art="search" title={t('image-host.image.noMatch')} />
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
                    {images.map((image) => (
                        <ImageCard
                            key={image.file}
                            t={t}
                            src={imageUrl(library, category.name, image)}
                            image={image}
                            picked={picked.has(image.file)}
                            selecting={selecting}
                            address={address(image)}
                            exposePending={expose.pending}
                            onToggle={() => toggle(image.file)}
                            onPreview={() => setPreviewing(image.file)}
                            onCopy={(text) => void copyAddress(text)}
                            onExpose={(exposed) => setExposed([image.file], exposed)}
                            onMove={() => setMoving(image)}
                            onDelete={() => setDeleting([image.file])}
                        />
                    ))}
                </div>
            )}
            {dragging && (
                <div className="pointer-events-none absolute -inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-background/80 backdrop-blur-sm">
                    <div className="flex items-center gap-2 font-medium">
                        <UploadIcon className="size-4" />
                        {t('image-host.upload.dropHere', { name: category.name })}
                    </div>
                </div>
            )}
            {manualCopy}
            <CategoryDialog
                open={editing}
                category={category}
                taken={library.categories.map((item) => item.name)}
                onOpenChange={setEditing}
                onSaved={onSelect}
            />
            {previewIndex >= 0 && (
                <PreviewDialog
                    images={images}
                    index={previewIndex}
                    src={(image) => imageUrl(library, category.name, image)}
                    address={address}
                    onIndexChange={(index) => setPreviewing(images[index]?.file)}
                    onClose={() => setPreviewing(undefined)}
                />
            )}
            {moving && (
                <MoveDialog
                    image={moving}
                    category={category.name}
                    categories={library.categories.map((item) => item.name)}
                    onClose={() => setMoving(undefined)}
                />
            )}
            {deleting && (
                <ConfirmDialog
                    title={deleting.length === 1 ? t('image-host.image.deleteTitle', { name: deleting[0] }) : t('image-host.image.deleteManyTitle', { count: deleting.length })}
                    body={t(deleting.length === 1 ? 'image-host.image.deleteBody' : 'image-host.image.deleteManyBody')}
                    action={t('image-host.image.delete')}
                    pending={deleteImages.pending}
                    onConfirm={() => void deleteImages({ category: category.name, files: deleting })}
                    onClose={() => setDeleting(undefined)}
                />
            )}
            {removing && (
                <ConfirmDialog
                    title={t('image-host.category.deleteTitle', { name: category.name })}
                    body={t('image-host.category.deleteBody', { count: category.images.length })}
                    action={t('image-host.category.delete')}
                    pending={remove.pending}
                    onConfirm={() => void remove({ name: category.name })}
                    onClose={() => setRemoving(false)}
                />
            )}
        </section>
    )
}

/** 分类对 Bot 的可见性开关与对应的公开图片地址，开关直接决定地址是否可用，所以放在一起。 */
function AccessBar({ t, category, random, hasServer, pending, onChange }: {
    t: Translate
    category: CategoryView
    random?: string
    hasServer: boolean
    pending: boolean
    onChange(patch: { exposed?: boolean, randomOnly?: boolean }): void
}) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Label className="text-xs font-normal">
                <Switch size="sm" checked={category.exposed} disabled={pending} onCheckedChange={(exposed) => onChange({ exposed })} />
                {t('image-host.category.exposed')}
            </Label>
            <Label className="text-xs font-normal">
                <Switch size="sm" checked={category.randomOnly} disabled={pending} onCheckedChange={(randomOnly) => onChange({ randomOnly })} />
                {t('image-host.category.randomOnly')}
            </Label>
            <span aria-hidden className="h-4 w-px bg-border max-sm:hidden" />
            {random === undefined
                ? <span>{t(hasServer ? 'image-host.usage.hidden' : 'image-host.usage.noServer')}</span>
                : (
                    <>
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                            {t('image-host.usage.random')}
                            <CodeValue value={random} copy={t('image-host.usage.copy')} />
                        </span>
                        {category.randomOnly
                            ? <span>{t('image-host.usage.randomOnly')}</span>
                            : (
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                    {t('image-host.usage.file')}
                                    <CodeValue value={`${random}/${t('image-host.usage.fileName')}`} />
                                </span>
                            )}
                    </>
                )}
        </div>
    )
}

/** 有图片被选中时点击缩略图切换选中，否则打开预览。 */
function ImageCard({ t, src, image, picked, selecting, address, exposePending, onToggle, onPreview, onCopy, onExpose, onMove, onDelete }: {
    t: Translate
    src: string
    image: ImageEntry
    picked: boolean
    selecting: boolean
    address?: string
    exposePending: boolean
    onToggle(): void
    onPreview(): void
    onCopy(text: string): void
    onExpose(exposed: boolean): void
    onMove(): void
    onDelete(): void
}) {
    return (
        <figure className={cn('group relative m-0 overflow-hidden rounded-lg border bg-card transition-shadow', picked && 'border-primary ring-2 ring-primary/40')}>
            <Button
                variant="ghost"
                className="block h-auto w-full rounded-none p-0"
                aria-label={t(selecting ? 'image-host.image.select' : 'image-host.image.preview', { name: image.file })}
                aria-pressed={selecting ? picked : undefined}
                onClick={selecting ? onToggle : onPreview}
            >
                <img
                    src={src}
                    alt={image.file}
                    loading="lazy"
                    draggable={false}
                    className={cn('aspect-square w-full bg-muted/40 object-contain transition-opacity', !image.exposed && 'opacity-40')}
                />
            </Button>
            {/* 悬停、聚焦、触屏或已进入多选时显示勾选框。 */}
            <div className={cn('absolute top-2 left-2 flex rounded-[5px] bg-background/80 p-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100', (selecting || picked) && 'opacity-100')}>
                <Checkbox checked={picked} aria-label={t('image-host.image.select', { name: image.file })} onCheckedChange={onToggle} />
            </div>
            <figcaption className="flex items-center gap-1 border-t py-1.5 pr-1 pl-2.5">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-xs font-medium">
                        {!image.exposed && <EyeOffIcon className="size-3 shrink-0 text-muted-foreground" aria-label={t('image-host.image.hidden')} />}
                        <span className="truncate" title={image.file}>{image.file}</span>
                    </div>
                    <div className="text-[11px] leading-4 text-muted-foreground tabular-nums">{formatSize(image.size)}</div>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={t('image-host.image.actions', { name: image.file })} />}>
                        <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={onPreview}>
                            <ZoomInIcon />
                            {t('image-host.image.view')}
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={address === undefined} onClick={() => address !== undefined && onCopy(address)}>
                            <CopyIcon />
                            {t('image-host.image.copyUrl')}
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={exposePending} onClick={() => onExpose(!image.exposed)}>
                            {image.exposed ? <EyeOffIcon /> : <EyeIcon />}
                            {t(image.exposed ? 'image-host.image.hide' : 'image-host.image.show')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onMove}>
                            <FolderInputIcon />
                            {t('image-host.image.move')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={onDelete}>
                            <Trash2Icon />
                            {t('image-host.image.delete')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </figcaption>
        </figure>
    )
}
