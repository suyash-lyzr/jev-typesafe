import { cn } from '@/lib/utils'
import { pastelFor } from './pastel'

/** A card with an icon: the unit for turning a paragraph into a glance. Server-safe. */
export function IconCard({
  Icon,
  title,
  children,
  className,
}: {
  Icon: React.ComponentType<{ className?: string }>
  title: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-[16px] border border-border bg-card p-5 shadow-card', className)}>
      <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[hsl(var(--pop-line))] text-foreground', pastelFor(title))} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="mt-3 text-[14.5px] font-semibold">{title}</h3>
      {children && <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  )
}
