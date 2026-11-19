import * as React from 'react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Button,
    CodeValue,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    Input,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Spinner,
    Textarea,
} from '@chatluna/ui-kit'
import { apiErrorMessage, toast, useAction } from '@chatluna/ui-client/client'
import type { CategoryView, ImageEntry } from '../src/types'
import { invalidName, mimeOfName } from '../src/utils'
import { useT } from './i18n'
import { formatSize } from './upload'

/** 新建（不传 category）或编辑分类的名称与描述。 */
export function CategoryDialog({ open, category, taken, onOpenChange, onSaved }: {
    open: boolean
    category?: CategoryView
    taken: readonly string[]
    onOpenChange(open: boolean): void
    onSaved(name: string): void
}) {
    const t = useT()
    const [name, setName] = React.useState('')
    const [description, setDescription] = React.useState('')
    React.useEffect(() => {
        if (!open) return
        setName(category?.name ?? '')
        setDescription(category?.description ?? '')
    }, [open, category])
    const done = (saved: string) => {
        onOpenChange(false)
        onSaved(saved)
    }
    const create = useAction('image-host.category.create', {
        onSuccess: () => done(name.trim()),
        onError: (error) => toast.error(t('image-host.category.createFailed'), { description: apiErrorMessage(error) }),
    })
    const update = useAction('image-host.category.update', {
        onSuccess: () => done(name.trim()),
        onError: (error) => toast.error(t('image-host.category.updateFailed'), { description: apiErrorMessage(error) }),
    })
    const trimmed = name.trim()
    const lower = trimmed.toLowerCase()
    const error = trimmed === ''
        ? undefined
        : invalidName(trimmed, '分类名') !== undefined
            ? t('image-host.name.invalid')
            : taken.some((item) => item.toLowerCase() === lower && item !== category?.name)
                ? t('image-host.category.taken')
                : undefined
    const pending = create.pending || update.pending
    const submit = () => {
        if (trimmed === '' || error !== undefined) return
        if (category) void update({ name: category.name, rename: trimmed, description: description.trim() })
        else void create({ name: trimmed, description: description.trim() })
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t(category ? 'image-host.category.editTitle' : 'image-host.category.createTitle')}</DialogTitle>
                </DialogHeader>
                <form id="image-host-category" onSubmit={(event) => {
                    event.preventDefault()
                    submit()
                }}>
                    <FieldGroup>
                        <Field data-invalid={error !== undefined}>
                            <FieldLabel htmlFor="image-host-category-name">{t('image-host.category.name')}</FieldLabel>
                            <Input
                                id="image-host-category-name"
                                autoFocus
                                value={name}
                                placeholder={t('image-host.category.namePlaceholder')}
                                aria-invalid={error !== undefined}
                                onChange={(event) => setName(event.target.value)}
                            />
                            {error === undefined
                                ? <FieldDescription>{t('image-host.category.nameHint')}</FieldDescription>
                                : <FieldError>{error}</FieldError>}
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="image-host-category-description">{t('image-host.category.descriptionLabel')}</FieldLabel>
                            <Textarea
                                id="image-host-category-description"
                                className="min-h-20"
                                value={description}
                                maxLength={500}
                                placeholder={t('image-host.category.descriptionPlaceholder')}
                                onChange={(event) => setDescription(event.target.value)}
                            />
                            <FieldDescription>{t('image-host.category.descriptionHint')}</FieldDescription>
                        </Field>
                    </FieldGroup>
                </form>
                <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>{t('image-host.cancel')}</DialogClose>
                    <Button type="submit" form="image-host-category" disabled={trimmed === '' || error !== undefined || pending}>
                        {pending && <Spinner />}
                        {t('image-host.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/** 重命名图片或移到其他分类；扩展名保持不变。 */
export function MoveDialog({ image, category, categories, onClose }: {
    image: ImageEntry
    category: string
    categories: readonly string[]
    onClose(): void
}) {
    const t = useT()
    const dot = image.file.lastIndexOf('.')
    const extension = image.file.slice(dot)
    const [stem, setStem] = React.useState(image.file.slice(0, dot))
    const [target, setTarget] = React.useState(category)
    const move = useAction('image-host.image.move', {
        onSuccess: onClose,
        onError: (error) => toast.error(t('image-host.image.moveFailed'), { description: apiErrorMessage(error) }),
    })
    const file = `${stem.trim()}${extension}`
    const error = stem.trim() === '' || invalidName(file, '文件名') !== undefined || mimeOfName(file) !== image.mime
        ? t('image-host.name.invalid')
        : undefined
    const unchanged = file === image.file && target === category
    const items = categories.map((value) => ({ value, label: value }))
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('image-host.image.moveTitle')}</DialogTitle>
                    <DialogDescription>{t('image-host.image.moveHint')}</DialogDescription>
                </DialogHeader>
                <form id="image-host-move" onSubmit={(event) => {
                    event.preventDefault()
                    if (error !== undefined || unchanged) return
                    void move({ category, file: image.file, target: target === category ? undefined : target, rename: file === image.file ? undefined : file })
                }}>
                    <FieldGroup>
                        <Field data-invalid={error !== undefined}>
                            <FieldLabel htmlFor="image-host-move-name">{t('image-host.image.fileName')}</FieldLabel>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="image-host-move-name"
                                    autoFocus
                                    value={stem}
                                    aria-invalid={error !== undefined}
                                    onChange={(event) => setStem(event.target.value)}
                                />
                                <span className="shrink-0 font-mono text-xs text-muted-foreground">{extension}</span>
                            </div>
                            {error !== undefined && <FieldError>{error}</FieldError>}
                        </Field>
                        <Field>
                            <FieldLabel>{t('image-host.image.target')}</FieldLabel>
                            <Select items={items} value={target} onValueChange={(value) => value !== null && setTarget(value)}>
                                <SelectTrigger aria-label={t('image-host.image.target')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        {items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                    </FieldGroup>
                </form>
                <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>{t('image-host.cancel')}</DialogClose>
                    <Button type="submit" form="image-host-move" disabled={error !== undefined || unchanged || move.pending}>
                        {move.pending && <Spinner />}
                        {t('image-host.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function PreviewDialog({ src, image, address, onClose }: {
    src: string
    image: ImageEntry
    /** 公开图片地址；隐藏分类没有。 */
    address?: string
    onClose(): void
}) {
    const t = useT()
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="truncate pr-8">{image.file}</DialogTitle>
                    <DialogDescription>
                        {formatSize(image.size)} · {image.mime}
                    </DialogDescription>
                </DialogHeader>
                <img src={src} alt={image.file} className="max-h-[60vh] w-full rounded-lg bg-muted/40 object-contain" />
                {address !== undefined && (
                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        {t('image-host.usage.file')}
                        <CodeValue value={address} copy={t('image-host.usage.copy')} />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

export function ConfirmDialog({ title, body, action, pending, onConfirm, onClose }: {
    title: string
    body: string
    action: string
    pending: boolean
    onConfirm(): void
    onClose(): void
}) {
    const t = useT()
    return (
        <AlertDialog open onOpenChange={(open) => !open && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{body}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t('image-host.cancel')}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>
                        {pending && <Spinner />}
                        {action}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
