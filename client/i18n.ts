import * as React from 'react'
import { useLocale, useTranslate, type Translate } from '@chatluna/ui-client/client'

export const LOCALE_NS = 'image-host'

/** 宿主按命名空间缓存 `t`，切换语言后引用不变；按语言快照换新引用，依赖 `t` 的记忆值才会跟随切换。 */
export function useT(): Translate {
    const locale = useLocale()
    const translate = useTranslate(LOCALE_NS)
    return React.useMemo<Translate>(() => (key, params) => translate(key, params), [translate, locale])
}
