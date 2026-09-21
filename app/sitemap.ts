import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'
import { LESSONS } from '@/content/lessons'

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/play', '/learn', '/presets', '/limits', '/compare', '/cheatsheet', '/about', '/privacy']
  return [
    ...pages.map((p) => ({ url: `${SITE.url}${p}`, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.7 })),
    ...LESSONS.map((l) => ({ url: `${SITE.url}/learn/${l.slug}`, changeFrequency: 'monthly' as const, priority: 0.6 })),
  ]
}
