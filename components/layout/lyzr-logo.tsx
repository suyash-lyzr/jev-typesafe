import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Lyzr's marks, in an ink version for light mode and a light version for dark
 * mode. Both are rendered; the `dark` class on <html> picks one, so nothing
 * waits for JavaScript and nothing flashes.
 */

const ASSETS = {
  mark: { ink: '/brand/lyzr-mark-ink.png', light: '/brand/lyzr-mark-light.png', w: 256, h: 256 },
  text: { ink: '/brand/lyzr-text-ink.png', light: '/brand/lyzr-text-light.png', w: 156, h: 96 },
  logo: { ink: '/brand/lyzr-logo-ink.png', light: '/brand/lyzr-logo-light.png', w: 415, h: 160 },
} as const

export function LyzrLogo({
  variant = 'logo',
  className,
  alt = 'Lyzr',
}: {
  variant?: keyof typeof ASSETS
  /** Set the height (e.g. h-4); width follows the aspect ratio. */
  className?: string
  alt?: string
}) {
  const a = ASSETS[variant]
  const common = cn('w-auto select-none', className)
  return (
    <>
      <Image src={a.ink} width={a.w} height={a.h} alt={alt} className={cn(common, 'dark:hidden')} priority={variant !== 'logo'} />
      <Image src={a.light} width={a.w} height={a.h} alt="" aria-hidden className={cn(common, 'hidden dark:block')} />
    </>
  )
}
