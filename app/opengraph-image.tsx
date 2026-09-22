import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { SITE } from '@/lib/site'

export const alt = `${SITE.fullName} — ${SITE.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The link card people see when a Jev Lab URL is posted: stone-white canvas,
 * warm ink type, and Lyzr's mark and wordmark.
 */
export default async function OpengraphImage() {
  const asData = async (file: string) =>
    `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/brand', file))).toString('base64')}`
  const [mark, text] = await Promise.all([asData('lyzr-mark-ink.png'), asData('lyzr-text-ink.png')])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#F8F6F2',
          color: '#1C1A18',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} width={44} height={44} alt="" />
          <span style={{ fontWeight: 700 }}>{SITE.name}</span>
          <span style={{ color: '#6B6660', display: 'flex', alignItems: 'center', gap: 10 }}>
            by
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={text} width={49} height={30} alt="Lyzr" style={{ marginTop: 6 }} />
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>Jev doesn’t write.</div>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>It decides.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#6B6660' }}>
          <span>A free playground and course for TypeSafe AI’s Jev</span>
          <span>Not affiliated with TypeSafe AI</span>
        </div>
      </div>
    ),
    size
  )
}
