import * as React from 'react'
import { Button, Label, Section, Spinner, Switch, Textarea, cn, saveShortcutLabel, useSaveShortcut } from '@chatluna/ui-kit'
import { RotateCcwIcon, SaveIcon } from 'lucide-react'
import { apiErrorMessage, toast, useAction } from '@chatluna/ui-client/client'
import type { LibraryView } from '../src/types'
import { useT } from './i18n'

/** 与 `image-host.prompt.save` 的 Schema 上限一致。 */
const MAX_LENGTH = 8000

/** 注入开关、提示词模板编辑与注入预览；预览始终对应已保存的模板。 */
export function PromptEditor({ library }: { library: LibraryView }) {
    const t = useT()
    const { prompt } = library
    const [draft, setDraft] = React.useState(prompt.template)
    // 其他窗口保存后同步过来；本地有未保存的修改时不覆盖。
    const saved = React.useRef(prompt.template)
    React.useEffect(() => {
        setDraft((current) => (current === saved.current ? prompt.template : current))
        saved.current = prompt.template
    }, [prompt.template])
    const save = useAction('image-host.prompt.save', {
        onSuccess: () => toast.success(t('image-host.prompt.saved')),
        onError: (error) => toast.error(t('image-host.prompt.saveFailed'), { description: apiErrorMessage(error) }),
    })
    // 开关切换即时保存，不进入模板草稿。
    const inject = useAction('image-host.settings.save', {
        onError: (error) => toast.error(t('image-host.settings.saveFailed'), { description: apiErrorMessage(error) }),
    })
    const missing = !draft.includes('{categories}') || !draft.includes('{url}')
    const tooLong = draft.length > MAX_LENGTH
    const canSave = !save.pending && !tooLong && draft !== prompt.template
    useSaveShortcut(() => void save({ template: draft }), canSave)
    return (
        <div className="grid items-start gap-6 xl:grid-cols-2">
            <Section
                title={t('image-host.prompt.template')}
                actions={(
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={save.pending || draft === prompt.defaultTemplate}
                            onClick={() => {
                                setDraft(prompt.defaultTemplate)
                                void save({})
                            }}
                        >
                            <RotateCcwIcon />
                            {t('image-host.prompt.reset')}
                        </Button>
                        <Button size="sm" disabled={!canSave} title={saveShortcutLabel} aria-keyshortcuts={saveShortcutLabel === '⌘S' ? 'Meta+S' : 'Control+S'} onClick={() => void save({ template: draft })}>
                            {save.pending ? <Spinner /> : <SaveIcon />}
                            {t('image-host.save')}
                        </Button>
                    </>
                )}
            >
                <Textarea
                    aria-label={t('image-host.prompt.template')}
                    aria-invalid={tooLong}
                    className="min-h-72 font-mono text-xs leading-5"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                />
                <div className="flex items-start gap-3 text-xs">
                    <p className={cn('flex-1', missing ? 'text-destructive' : 'text-muted-foreground')}>
                        {t(missing ? 'image-host.prompt.missing' : 'image-host.prompt.hint', { placeholder: '{categories}', url: '{url}' })}
                    </p>
                    <span className={cn('shrink-0 tabular-nums', tooLong ? 'text-destructive' : 'text-muted-foreground')}>
                        {draft.length} / {MAX_LENGTH}
                    </span>
                </div>
            </Section>
            <Section
                title={t('image-host.prompt.preview')}
                actions={(
                    // 与左栏标题行的按钮等高，两栏内容区顶端对齐。
                    <Label className="h-[26px] text-xs font-normal text-muted-foreground">
                        <Switch
                            size="sm"
                            checked={prompt.enabled}
                            disabled={inject.pending}
                            onCheckedChange={(injectPrompt) => void inject({ injectPrompt })}
                        />
                        {t('image-host.prompt.inject')}
                    </Label>
                )}
            >
                {prompt.preview === '' ? (
                    <p className="flex min-h-72 items-center justify-center rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                        {t(prompt.enabled ? 'image-host.prompt.previewEmpty' : 'image-host.prompt.previewDisabled')}
                    </p>
                ) : (
                    <pre className="m-0 min-h-72 rounded-lg border bg-muted/40 px-2.5 py-2 font-mono text-xs leading-5 break-words whitespace-pre-wrap">
                        {prompt.preview}
                    </pre>
                )}
                <p className="text-xs text-muted-foreground">{t('image-host.prompt.previewHint')}</p>
            </Section>
        </div>
    )
}
