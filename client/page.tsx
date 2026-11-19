import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Alert, AlertDescription, AlertTitle, Button, ButtonLabel, PageHeader, Skeleton, Spinner, Tabs, TabsList, TabsTrigger } from '@chatluna/ui-kit'
import { PlusIcon, RefreshCwIcon, SparklesIcon } from 'lucide-react'
import { apiErrorMessage, toast, useAction, useLive } from '@chatluna/ui-client/client'
import { useT } from './i18n'
import { Gallery } from './gallery'
import { PromptEditor } from './prompt'
import { SettingsPanel } from './settings'
import { CategoryDialog } from './dialogs'
import { reportDedupe } from './upload'

const tabs = ['images', 'prompt', 'settings'] as const

export function ImageHostPage() {
    const t = useT()
    const navigate = useNavigate()
    const { category } = useParams()
    const [params, setParams] = useSearchParams()
    const tab = tabs.find((item) => item === params.get('tab')) ?? 'images'
    const [creating, setCreating] = React.useState(false)
    const query = useLive('image-host.library')
    const library = query.data ?? undefined
    const rescan = useAction('image-host.rescan', {
        onSuccess: () => toast.success(t('image-host.rescan.done')),
        onError: (error) => toast.error(t('image-host.rescan.failed'), { description: apiErrorMessage(error) }),
    })
    const dedupe = useAction('image-host.dedupe', {
        onSuccess: (result) => reportDedupe(t, result),
        onError: (error) => toast.error(t('image-host.dedupe.failed'), { description: apiErrorMessage(error) }),
    })
    const open = (name?: string) => navigate(name === undefined ? '/image-host' : `/image-host/${encodeURIComponent(name)}`)

    return (
        <div className="flex min-h-full flex-col gap-5 p-(--page-gutter) text-sm leading-5">
            <PageHeader
                title={t('image-host.title')}
                actions={(
                    <>
                        <Button variant="outline" size="sm" disabled={rescan.pending} onClick={() => void rescan({})}>
                            {rescan.pending ? <Spinner /> : <RefreshCwIcon />}
                            <ButtonLabel>{t('image-host.rescan.action')}</ButtonLabel>
                        </Button>
                        <Button variant="outline" size="sm" disabled={dedupe.pending || !library?.categories.length} onClick={() => void dedupe({})}>
                            {dedupe.pending ? <Spinner /> : <SparklesIcon />}
                            <ButtonLabel>{t('image-host.dedupe.all')}</ButtonLabel>
                        </Button>
                        <Button size="sm" onClick={() => setCreating(true)}>
                            <PlusIcon />
                            <ButtonLabel>{t('image-host.category.create')}</ButtonLabel>
                        </Button>
                    </>
                )}
            >
                <Tabs value={tab} onValueChange={(value) => setParams(value === 'images' ? {} : { tab: String(value) })}>
                    <TabsList>
                        <TabsTrigger value="images">{t('image-host.tab.images')}</TabsTrigger>
                        <TabsTrigger value="prompt">{t('image-host.tab.prompt')}</TabsTrigger>
                        <TabsTrigger value="settings">{t('image-host.tab.settings')}</TabsTrigger>
                    </TabsList>
                </Tabs>
            </PageHeader>
            {query.error !== undefined && (
                <Alert variant="destructive">
                    <AlertTitle>{t('image-host.loadFailed')}</AlertTitle>
                    <AlertDescription>{query.error}</AlertDescription>
                </Alert>
            )}
            {library === undefined
                ? <Skeleton className="h-64 w-full" />
                : tab === 'prompt'
                    ? <PromptEditor library={library} />
                    : tab === 'settings'
                        ? <SettingsPanel library={library} />
                        : <Gallery library={library} selected={category} onSelect={open} onCreate={() => setCreating(true)} />}
            <CategoryDialog
                open={creating}
                taken={library?.categories.map((item) => item.name) ?? []}
                onOpenChange={setCreating}
                onSaved={open}
            />
        </div>
    )
}
