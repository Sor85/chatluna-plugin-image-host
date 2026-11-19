import { ImagesIcon } from 'lucide-react'
import { Badge } from '@chatluna/ui-kit'
// 只取需要的字段，Vite 按具名导入裁剪 JSON，其余内容不进客户端产物。
import { license, name, version } from '../package.json'
import { useT } from './i18n'

/** 设置导航末尾的「关于」面板，版式与 onebot-sandbox 一致；版本号读自 package.json，发版无需改动。 */
export function AboutPanel() {
    const t = useT()
    const rows: { label: string, value: string, mono?: boolean }[] = [
        { label: t('image-host.about.version'), value: version, mono: true },
        { label: t('image-host.about.package'), value: name, mono: true },
        { label: t('image-host.about.license'), value: license },
        { label: t('image-host.about.host'), value: 'ChatLuna v2' },
    ]
    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ImagesIcon className="size-5" />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] leading-5 font-semibold">{t('image-host.title')}</h3>
                        <Badge variant="outline" className="font-mono">v{version}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('image-host.about.summary')}</p>
                </div>
            </div>
            <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2.5 border-t border-border pt-4 text-[13px] leading-5">
                {rows.map((row) => (
                    <div key={row.label} className="contents">
                        <dt className="text-muted-foreground">{row.label}</dt>
                        <dd className={row.mono ? 'm-0 font-mono text-xs leading-5 break-all' : 'm-0'}>{row.value}</dd>
                    </div>
                ))}
            </dl>
        </div>
    )
}
