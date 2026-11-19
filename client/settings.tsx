import * as React from 'react'
import { Button, CodeValue, Input, Label, Section, SettingRow, Spinner, Switch } from '@chatluna/ui-kit'
import { RotateCcwIcon, SaveIcon } from 'lucide-react'
import { apiErrorMessage, toast, useAction } from '@chatluna/ui-client/client'
import type { LibraryView, Settings } from '../src/types'
import { useT } from './i18n'

type Draft = { [K in keyof Settings]: Settings[K] extends number ? string : Settings[K] }

const toDraft = (settings: Settings): Draft => ({
    ...settings,
    promptFileLimit: String(settings.promptFileLimit),
    maxFileSize: String(settings.maxFileSize),
})

const urlPattern = /^(https?:\/\/[^\s/?#]+(\/[^\s?#]*)?)?$/u

function integer(value: string, min: number, max: number) {
    if (!/^\d+$/u.test(value.trim())) return
    const number = Number(value)
    return number >= min && number <= max ? number : undefined
}

/** 插件设置；与提示词编辑器相同，未修改时跟随其他窗口的保存结果，已修改时不覆盖。 */
export function SettingsPanel({ library }: { library: LibraryView }) {
    const t = useT()
    const [draft, setDraft] = React.useState(() => toDraft(library.settings))
    const savedKey = JSON.stringify(library.settings)
    const saved = React.useRef(library.settings)
    React.useEffect(() => {
        setDraft((current) => (JSON.stringify(current) === JSON.stringify(toDraft(saved.current)) ? toDraft(library.settings) : current))
        saved.current = library.settings
    }, [savedKey])
    const save = useAction('image-host.settings.save', {
        onSuccess: () => toast.success(t('image-host.settings.saved')),
        onError: (error) => toast.error(t('image-host.settings.saveFailed'), { description: apiErrorMessage(error) }),
    })

    const limit = integer(draft.promptFileLimit, 0, 500)
    const size = integer(draft.maxFileSize, 1, 50)
    const baseUrl = draft.baseUrl.trim().replace(/\/+$/u, '')
    const urlValid = urlPattern.test(baseUrl)
    const valid = limit !== undefined && size !== undefined && urlValid
    const next: Settings | undefined = valid ? { injectPrompt: draft.injectPrompt, promptFileLimit: limit, baseUrl, maxFileSize: size } : undefined
    const changed = next === undefined || JSON.stringify(next) !== savedKey
    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))

    return (
        <Section
            title={t('image-host.settings.title')}
            className="max-w-3xl"
            actions={(
                <>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={save.pending || JSON.stringify(library.settings) === JSON.stringify(library.defaultSettings)}
                        onClick={() => void save(library.defaultSettings)}
                    >
                        <RotateCcwIcon />
                        {t('image-host.settings.reset')}
                    </Button>
                    <Button size="sm" disabled={save.pending || !valid || !changed} onClick={() => next && void save(next)}>
                        {save.pending ? <Spinner /> : <SaveIcon />}
                        {t('image-host.save')}
                    </Button>
                </>
            )}
        >
            <div className="divide-y rounded-lg border px-4">
                <SettingRow
                    title={<Label htmlFor="image-host-inject">{t('image-host.settings.inject')}</Label>}
                    description={t('image-host.settings.injectHint')}
                    control={<Switch id="image-host-inject" checked={draft.injectPrompt} onCheckedChange={(checked) => set('injectPrompt', checked)} />}
                />
                <SettingRow
                    title={<Label htmlFor="image-host-limit">{t('image-host.settings.limit')}</Label>}
                    description={limit === undefined ? <span className="text-destructive">{t('image-host.settings.range', { min: 0, max: 500 })}</span> : t('image-host.settings.limitHint')}
                    control={(
                        <Input
                            id="image-host-limit"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={500}
                            className="w-28"
                            aria-invalid={limit === undefined}
                            value={draft.promptFileLimit}
                            onChange={(event) => set('promptFileLimit', event.target.value)}
                        />
                    )}
                />
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
                <SettingRow
                    title={t('image-host.settings.dataDir')}
                    description={t('image-host.settings.dataDirHint')}
                >
                    <CodeValue value={library.imageDir} copy={t('image-host.settings.copyPath')} />
                </SettingRow>
            </div>
        </Section>
    )
}
