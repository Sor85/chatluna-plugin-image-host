import * as React from 'react'
import { Alert, AlertDescription, Button, Section, Spinner, Textarea } from '@chatluna/ui-kit'
import { RotateCcwIcon, SaveIcon } from 'lucide-react'
import { apiErrorMessage, toast, useAction } from '@chatluna/ui-client/client'
import type { LibraryView } from '../src/types'
import { useT } from './i18n'

/** 提示词模板编辑与注入预览；预览始终对应已保存的模板。 */
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
    const missing = !draft.includes('{categories}') || !draft.includes('{dir}')
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
                        <Button size="sm" disabled={save.pending || draft === prompt.template} onClick={() => void save({ template: draft })}>
                            {save.pending ? <Spinner /> : <SaveIcon />}
                            {t('image-host.save')}
                        </Button>
                    </>
                )}
            >
                {!prompt.enabled && (
                    <Alert>
                        <AlertDescription>{t('image-host.prompt.disabled')}</AlertDescription>
                    </Alert>
                )}
                <Textarea
                    aria-label={t('image-host.prompt.template')}
                    className="min-h-72 font-mono text-xs leading-5"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                />
                <p className={missing ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                    {t(missing ? 'image-host.prompt.missing' : 'image-host.prompt.hint', { placeholder: '{categories}', dir: '{dir}' })}
                </p>
            </Section>
            <Section title={t('image-host.prompt.preview')}>
                {prompt.preview === '' ? (
                    <p className="rounded-lg border border-dashed p-4 text-muted-foreground">
                        {t(prompt.enabled ? 'image-host.prompt.previewEmpty' : 'image-host.prompt.previewDisabled')}
                    </p>
                ) : (
                    <pre className="m-0 rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap">
                        {prompt.preview}
                    </pre>
                )}
                <p className="text-xs text-muted-foreground">{t('image-host.prompt.previewHint')}</p>
            </Section>
        </div>
    )
}
