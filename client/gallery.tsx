import * as React from 'react'
import {
    Badge,
    Button,
    ButtonLabel,
    CodeValue,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    EmptyState,
    Label,
    matchesQuery,
    SearchBox,
    Spinner,
    Switch,
    cn,
} from '@chatluna/ui-kit'
import {
    CopyIcon,
    EyeIcon,
    EyeOffIcon,
    FolderInputIcon,
    MoreHorizontalIcon,
    PencilIcon,
    PlusIcon,
    SparklesIcon,
    Trash2Icon,
    UploadIcon,
} from 'lucide-react'
import { apiBase, apiErrorMessage, toast, useAction } from '@chatluna/ui-client/client'
import type { CategoryView, ImageEntry, LibraryView, UploadResult } from '../src/types'
import { useT } from './i18n'
import { CategoryDialog, ConfirmDialog, MoveDialog, PreviewDialog } from './dialogs'
import { batches, encode, formatSize, reportDedupe, reportUpload } from './upload'

export function imageUrl(library: LibraryView, category: string, image: ImageEntry) {
    return `${apiBase()}${library.fileRoute}/${encodeURIComponent(category)}/${encodeURIComponent(image.file)}?v=${image.hash.slice(0, 16)}`
}

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
            <nav aria-label={t('image-host.category.list')} className="flex flex-col gap-0.5 md:sticky md:top-(--page-header-height)">
                {library.categories.map((category) => (
                    <Button
                        key={category.name}
                        variant="ghost"
                        aria-current={category === current ? 'page' : undefined}
                        className={cn('w-full justify-start gap-2', category === current && 'bg-foreground/6')}
                        onClick={() => onSelect(category.name)}
                    >
                        <span className="min-w-0 flex-1 truncate text-left">{category.name}</span>
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
    const [editing, setEditing] = React.useState(false)
    const [removing, setRemoving] = React.useState(false)
    const [previewing, setPreviewing] = React.useState<ImageEntry>()
    const [moving, setMoving] = React.useState<ImageEntry>()
    const [deleting, setDeleting] = React.useState<ImageEntry>()
    const [dragging, setDragging] = React.useState(false)
    const [uploading, setUploading] = React.useState(false)
    const fileInput = React.useRef<HTMLInputElement>(null)

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
    const deleteImage = useAction('image-host.image.delete', {
        onSuccess: () => setDeleting(undefined),
        onError: (error) => toast.error(t('image-host.image.deleteFailed'), { description: apiErrorMessage(error) }),
    })

    const send = async (files: File[]) => {
        const maxFileSize = library.settings.maxFileSize * 1024 * 1024
        const accepted = files.filter((file) => file.size <= maxFileSize)
        for (const file of files) {
            if (file.size > maxFileSize) toast.error(t('image-host.upload.failedOne', { name: file.name }), { description: t('image-host.upload.tooLarge', { size: formatSize(maxFileSize) }) })
        }
        if (accepted.length === 0) return
        setUploading(true)
        const total: UploadResult = { added: [], duplicates: [], errors: [] }
        try {
            for (const batch of batches(accepted)) {
                const result = await upload({ category: category.name, files: await encode(batch) })
                if (!result) continue
                total.added.push(...result.added)
                total.duplicates.push(...result.duplicates)
                total.errors.push(...result.errors)
            }
        } finally {
            setUploading(false)
        }
        reportUpload(t, total)
    }

    React.useEffect(() => {
        const paste = (event: ClipboardEvent) => {
            const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'))
            if (files.length === 0) return
            event.preventDefault()
            void send(files)
        }
        document.addEventListener('paste', paste)
        return () => document.removeEventListener('paste', paste)
    })

    const copy = async (text: string) => {
        await navigator.clipboard.writeText(text)
        toast.success(t('image-host.copied', { text }))
    }
    const images = category.images.filter((image) => matchesQuery(search, image.file))
    // 隐藏分类不提供公开地址。
    const random = category.exposed && library.imageUrl ? `${library.imageUrl}/${category.name}` : undefined

    return (
        <section
            aria-label={category.name}
            className={cn('min-w-0 space-y-4 rounded-xl outline-2 outline-offset-4 outline-transparent transition-[outline-color]', dragging && 'outline-dashed outline-primary/60')}
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
                    <div className="flex items-center gap-2">
                        <h2 className="truncate text-base font-semibold">{category.name}</h2>
                        <Badge variant="secondary">{t('image-host.category.count', { count: category.images.length })}</Badge>
                    </div>
                    <p className="text-muted-foreground">{category.description || t('image-host.category.noDescription')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs font-normal text-muted-foreground">
                        <Switch
                            size="sm"
                            checked={category.exposed}
                            disabled={update.pending}
                            onCheckedChange={(exposed) => void update({ name: category.name, exposed })}
                        />
                        {t('image-host.category.exposed')}
                    </Label>
                    <Button size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                        {uploading ? <Spinner /> : <UploadIcon />}
                        <ButtonLabel>{t('image-host.upload.action')}</ButtonLabel>
                    </Button>
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {random === undefined
                    ? <span>{t(library.imageUrl ? 'image-host.usage.hidden' : 'image-host.usage.noServer')}</span>
                    : (
                        <>
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                                {t('image-host.usage.random')}
                                <CodeValue value={random} copy={t('image-host.usage.copy')} />
                            </span>
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                                {t('image-host.usage.file')}
                                <CodeValue value={`${random}/${t('image-host.usage.fileName')}`} />
                            </span>
                        </>
                    )}
                <span>{t('image-host.usage.drop')}</span>
            </div>
            {category.images.length > 0 && (
                <SearchBox value={search} onChange={setSearch} placeholder={t('image-host.image.search')} clearLabel={t('image-host.image.searchClear')} />
            )}
            {category.images.length === 0 ? (
                <EmptyState
                    title={t('image-host.image.empty')}
                    hint={t('image-host.image.emptyHint')}
                    actions={(
                        <Button size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                            {uploading ? <Spinner /> : <UploadIcon />}
                            {t('image-host.upload.action')}
                        </Button>
                    )}
                />
            ) : images.length === 0 ? (
                <EmptyState art="search" title={t('image-host.image.noMatch')} />
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
                    {images.map((image) => (
                        <figure key={image.file} className="m-0 overflow-hidden rounded-lg border bg-card">
                            <Button
                                variant="ghost"
                                className="block h-auto w-full rounded-none p-0"
                                aria-label={t('image-host.image.preview', { name: image.file })}
                                onClick={() => setPreviewing(image)}
                            >
                                <img
                                    src={imageUrl(library, category.name, image)}
                                    alt={image.file}
                                    loading="lazy"
                                    draggable={false}
                                    className="aspect-square w-full bg-muted/40 object-contain"
                                />
                            </Button>
                            <figcaption className="flex items-center gap-1 border-t py-1.5 pr-1 pl-2.5">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-medium" title={image.file}>{image.file}</div>
                                    <div className="text-[11px] leading-4 text-muted-foreground tabular-nums">{formatSize(image.size)}</div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={t('image-host.image.actions', { name: image.file })} />}>
                                        <MoreHorizontalIcon />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuItem onClick={() => setPreviewing(image)}>
                                            <EyeIcon />
                                            {t('image-host.image.view')}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={random === undefined} onClick={() => void copy(`${random}/${image.file}`)}>
                                            <CopyIcon />
                                            {t('image-host.image.copyUrl')}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setMoving(image)}>
                                            <FolderInputIcon />
                                            {t('image-host.image.move')}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(image)}>
                                            <Trash2Icon />
                                            {t('image-host.image.delete')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            )}
            <CategoryDialog
                open={editing}
                category={category}
                taken={library.categories.map((item) => item.name)}
                onOpenChange={setEditing}
                onSaved={onSelect}
            />
            {previewing && (
                <PreviewDialog
                    src={imageUrl(library, category.name, previewing)}
                    image={previewing}
                    address={random && `${random}/${previewing.file}`}
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
                    title={t('image-host.image.deleteTitle', { name: deleting.file })}
                    body={t('image-host.image.deleteBody')}
                    action={t('image-host.image.delete')}
                    pending={deleteImage.pending}
                    onConfirm={() => void deleteImage({ category: category.name, files: [deleting.file] })}
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
