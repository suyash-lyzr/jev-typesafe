import type { Config } from 'tailwindcss'
import sagePreset from './sage-preset'

// Tailwind v3 on purpose: the Sage bundle ships a v3 preset. Under v4's
// CSS-first config the preset is never loaded and every `bg-brand-soft`
// style silently renders as nothing.
export default {
  presets: [sagePreset],
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        faint: 'hsl(var(--faint))',
        fill: 'hsl(var(--fill))',
        panel: 'hsl(var(--panel))',
        sidebar: 'hsl(var(--sidebar))',
        results: 'hsl(var(--results))',
        pastel: {
          1: 'hsl(var(--pastel-1))',
          2: 'hsl(var(--pastel-2))',
          3: 'hsl(var(--pastel-3))',
          4: 'hsl(var(--pastel-4))',
          5: 'hsl(var(--pastel-5))',
        },
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.18s cubic-bezier(.19,1,.22,1)',
        'accordion-up': 'accordion-up 0.18s cubic-bezier(.19,1,.22,1)',
      },
      transitionTimingFunction: {
        sage: 'cubic-bezier(.19,1,.22,1)',
        signal: 'cubic-bezier(.2,.8,.2,1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        expressive: '320ms',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config
