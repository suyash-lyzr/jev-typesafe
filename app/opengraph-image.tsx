import { ImageResponse } from 'next/og'
import { SITE } from '@/lib/site'

export const alt = `${SITE.fullName} — ${SITE.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The link card people see when a Jev Lab URL is posted. Sage's near-white
 * canvas and ink type; the one teal mark is the brand dot.
 */
export default function OpengraphImage() {
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
          background: '#FCFCFC',
          color: '#171717',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: '#2F7F70' }} />
          <span style={{ fontWeight: 700 }}>{SITE.name}</span>
          <span style={{ color: '#666' }}>{SITE.byline}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>Jev doesn’t write.</div>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>It decides.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#555' }}>
          <span>A free playground and course for TypeSafe AI’s Jev</span>
          <span>Not affiliated with TypeSafe AI</span>
        </div>
      </div>
    ),
    size
  )
}
