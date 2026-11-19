import type { Context } from 'cordis'
import zh from './locales/zh.yml'
import en from './locales/en.yml'
import { LOCALE_NS } from './i18n'

export default function apply(ctx: Context) {
    ctx.locale.register(LOCALE_NS, { zh, en })
    const t = ctx.locale.bind(LOCALE_NS)
    ctx.slots.route({
        path: '/image-host/:category?',
        page: async () => (await import('./page')).ImageHostPage,
        title: () => t('image-host.title'),
        icon: 'images',
        order: 70,
        group: 'capabilities',
    })
}
