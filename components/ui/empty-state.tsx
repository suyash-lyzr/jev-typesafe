import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * EmptyState — the canonical "nothing here yet" surface.
 * Icon is neutral (muted), title foreground, action(s) passed as children.
 */
const EmptyState = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    icon?: React.ReactNode
    title: string
    description?: string
    action?: React.ReactNode
  }
>(({ className, icon, title, description, action, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center",
      className
    )}
    {...props}
  >
    {icon && (
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </div>
    )}
    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    {description && (
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    )}
    {(action || children) && (
      <div className="mt-5 flex items-center gap-2">
        {action}
        {children}
      </div>
    )}
  </div>
))
EmptyState.displayName = "EmptyState"

export { EmptyState }
