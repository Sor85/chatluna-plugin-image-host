import * as React from 'react'
import { Button, CodeValue, Input, Label, SettingRow, Spinner, cn, saveShortcutLabel, useSaveShortcut } from '@chatluna/ui-kit'
import { DatabaseIcon, InfoIcon, RotateCcwIcon, SaveIcon, SlidersHorizontalIcon, type LucideIcon } from 'lucide-react'
import { apiErrorMessage, toast, useAction } from '@chatluna/ui-client/client'
import type { LibraryView, Settings } from '../src/types'
import { useT } from './i18n'
import { AboutPanel } from './about'
import { formatSize } from './upload'

/** 「注入提示词」在提示词标签中即时保存，不属于这里的草稿。 */
type Fields = Omit<Settings, 'injectPrompt'>
type Draft = { [K in keyof Fields]: Fields[K] extends number ? string : Fields[K] }

const pick = ({ baseUrl, maxFileSize }: Settings): Fields => ({ baseUrl, maxFileSize })

const toDraft = (settings: Settings): Draft => ({
    baseUrl: settings.baseUrl,
    maxFileSize: String(settings.maxFileSize),
})

const urlPattern = /^(https?:\/\/[^\s/?#]+(\/[^\s?#]*)?)?$/u

function integer(value: string, min: number, max: number) {
    if (!/^\d+$/u.test(value.trim())) return
    const number = Number(value)
    return number >= min && number <= max ? number : undefined
}

type SectionId = 'general' | 'storage' | 'about'

const sections: { id: SectionId, icon: LucideIcon }[] = [
    { id: 'general', icon: SlidersHorizontalIcon },
    { id: 'storage', icon: DatabaseIcon },
    { id: 'about', icon: InfoIcon },
]

/**
 * 插件设置；与提示词编辑器相同，未修改时跟随其他窗口的保存结果，已修改时不覆盖。
 * 当前分区由 `?section=` 决定，草稿保存在本组件，切换分区不丢失。
 */
export function SettingsPanel({ library, section, onSection }: {
    library: LibraryView
    section: string | null
    onSection(section: SectionId): void
}) {
    const t = useT()
    const [draft, setDraft] = React.useState(() => toDraft(library.settings))
    const savedKey = JSON.stringify(pick(library.settings))
    const defaults = pick(library.defaultSettings)
    const saved = React.useRef(library.settings)
    React.useEffect(() => {
        setDraft((current) => (JSON.stringify(current) === JSON.stringify(toDraft(saved.current)) ? toDraft(library.settings) : current))
        saved.current = library.settings
    }, [savedKey])
    const save = useAction('image-host.settings.save', {
        onSuccess: () => toast.success(t('image-host.settings.saved')),
        onError: (error) => toast.error(t('image-host.settings.saveFailed'), { description: apiErrorMessage(error) }),
    })

    const size = integer(draft.maxFileSize, 1, 50)
    const baseUrl = draft.baseUrl.trim().replace(/\/+$/u, '')
    const urlValid = urlPattern.test(baseUrl)
    const valid = size !== undefined && urlValid
    const next: Fields | undefined = valid ? { baseUrl, maxFileSize: size } : undefined
    const changed = next === undefined || JSON.stringify(next) !== savedKey
    const canSave = !save.pending && next !== undefined && changed
    const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(library.settings))
    useSaveShortcut(() => next && void save(next), canSave)
    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))

    const active = sections.find((item) => item.id === section) ?? sections[0]!
    const rowsFor: Record<SectionId, React.ReactNode> = {
        general: (
            <>
                <SettingRow
                    title={<Label htmlFor="image-host-base-url">{t('image-host.settings.baseUrl')}</Label>}
                    description={urlValid ? t('image-host.settings.baseUrlHint') : <span className="text-destructive">{t('image-host.settings.baseUrlInvalid')}</span>}
                    control={(
                        <Input
                            id="image-host-base-url"
                            className="w-72 max-w-full"
                            inputMode="url"
                            spellCheck={false}
                            placeholder={library.serverUrl || 'http://192.168.1.2:5028'}
                            aria-invalid={!urlValid}
                            value={draft.baseUrl}
                            onChange={(event) => set('baseUrl', event.target.value)}
                        />
                    )}
                >
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {library.imageUrl
                            ? (
                                <>
                                    {t('image-host.settings.currentUrl')}
                                    <CodeValue value={library.imageUrl} copy={t('image-host.usage.copy')} />
                                </>
                            )
                            : t('image-host.settings.noServer')}
                    </div>
                </SettingRow>
                <SettingRow
                    title={<Label htmlFor="image-host-size">{t('image-host.settings.maxFileSize')}</Label>}
                    description={size === undefined ? <span className="text-destructive">{t('image-host.settings.range', { min: 1, max: 50 })}</span> : t('image-host.settings.maxFileSizeHint')}
                    control={(
                        <Input
                            id="image-host-size"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={50}
                            className="w-28"
                            aria-invalid={size === undefined}
                            value={draft.maxFileSize}
                            onChange={(event) => set('maxFileSize', event.target.value)}
                        />
                    )}
                />
            </>
        ),
        storage: (
            <>
                <SettingRow title={t('image-host.settings.dataDir')} description={t('image-host.settings.dataDirHint')}>
                    <CodeValue value={library.imageDir} copy={t('image-host.settings.copyPath')} />
                </SettingRow>
                <SettingRow
                    title={t('image-host.settings.library')}
                    description={t('image-host.settings.libraryStats', {
                        categories: library.categories.length,
                        images: library.categories.reduce((sum, category) => sum + category.images.length, 0),
                        size: formatSize(library.categories.reduce((sum, category) => sum + category.images.reduce((total, image) => total + image.size, 0), 0)),
                    })}
                />
            </>
        ),
        about: <AboutPanel />,
    }
    const navButton = (item: typeof sections[number]) => (
        <Button
            key={item.id}
            variant="ghost"
            className={cn('shrink-0 justify-start md:w-full', item === active && 'bg-accent text-accent-foreground')}
            aria-current={item === active ? 'page' : undefined}
            onClick={() => onSection(item.id)}
        >
            <item.icon />
            <span>{t(`image-host.settings.section.${item.id}`)}</span>
            {item.id === 'general' && dirty && <span role="img" aria-label={t('image-host.settings.unsaved')} className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />}
        </Button>
    )

    // 版式与 onebot-sandbox 的设置页一致：左侧分区导航，右侧面板只显示当前分区，导航末尾隔开「关于」。
    // 页面随宿主整体滚动，面板不设内部滚动区。
    return (
        <div className="grid w-full max-w-5xl items-start gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
            <nav aria-label={t('image-host.settings.sections')} className="flex flex-wrap gap-0.5 rounded-xl p-1.5 ring-1 ring-border md:sticky md:top-(--page-header-height) md:flex-col">
                {sections.filter((item) => item.id !== 'about').map(navButton)}
                <div role="separator" className="mx-1 shrink-0 bg-border max-md:w-px md:my-1 md:h-px" />
                {navButton(sections.find((item) => item.id === 'about')!)}
            </nav>
            <section aria-label={t(`image-host.settings.section.${active.id}`)} className="min-w-0 overflow-hidden rounded-xl ring-1 ring-border">
                <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <h2 className="text-[13px] font-medium">{t(`image-host.settings.section.${active.id}`)}</h2>
                        <p className="text-[11px] text-muted-foreground">{t(`image-host.settings.section.${active.id}Hint`)}</p>
                    </div>
                    {active.id === 'general' && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={save.pending || savedKey === JSON.stringify(defaults)}
                                onClick={() => void save(defaults)}
                            >
                                <RotateCcwIcon />
                                {t('image-host.settings.reset')}
                            </Button>
                            <Button size="sm" disabled={!canSave} title={saveShortcutLabel} aria-keyshortcuts={saveShortcutLabel === '⌘S' ? 'Meta+S' : 'Control+S'} onClick={() => next && void save(next)}>
                                {save.pending ? <Spinner /> : <SaveIcon />}
                                {t('image-host.save')}
                            </Button>
                        </div>
                    )}
                </header>
                <div className="px-5 py-1">{active.id === 'about' ? <div className="py-4">{rowsFor.about}</div> : rowsFor[active.id]}</div>
            </section>
        </div>
    )
}
