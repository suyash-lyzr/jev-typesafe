import type { Metadata, Viewport } from 'next'
import { DM_Sans, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SITE } from '@/lib/site'
import { THEME_SCRIPT } from '@/lib/theme'
import './globals.css'

/**
 * Self-hosted by next/font: the files are downloaded at build time and served
 * from this origin, so no visitor's browser ever asks Google for them. The
 * hashed family names are aliased into the --font-* tokens in globals.css.
 * Quiet Signal: DM Sans for reading, Space Grotesk for headings and numbers.
 */
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0f15' },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.fullName} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  openGraph: {
    title: SITE.fullName,
    description: SITE.description,
    type: 'website',
    siteName: SITE.fullName,
  },
  twitter: { card: 'summary_large_image', title: SITE.fullName, description: SITE.description },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="sage"
      className={`${dmSans.variable} ${spaceGrotesk.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Before first paint: pick light or dark so nothing flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        {children}
        {/* Cookieless page views only; no custom events carry anyone's text. */}
        <Analytics />
      </body>
    </html>
  )
}
