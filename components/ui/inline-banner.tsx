import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const inlineBannerVariants = cva(
  "relative flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        // Neutral informational strip
        neutral: "border-border bg-muted/50 text-foreground [&>svg]:text-muted-foreground",
        // Teal supporting accent — brand/feature announcements
        brand: "border-brand/30 bg-brand-soft text-brand-text [&>svg]:text-brand",
        // Semantic feedback
        success: "border-success/30 bg-success-soft text-success-text [&>svg]:text-success-text",
        warning: "border-warning/30 bg-warning-soft text-warning-text [&>svg]:text-warning-text",
        danger: "border-danger/30 bg-danger-soft text-danger-text [&>svg]:text-danger-text",
        info: "border-info/30 bg-info-soft text-info-text [&>svg]:text-info-text",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

export interface InlineBannerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof inlineBannerVariants> {
  icon?: React.ReactNode
  action?: React.ReactNode
  onDismiss?: () => void
}

const InlineBanner = React.forwardRef<HTMLDivElement, InlineBannerProps>(
  (
    { className, variant, icon, action, onDismiss, children, ...props },
    ref
  ) => (
    <div
      ref={ref}
      role="status"
      className={cn(inlineBannerVariants({ variant }), className)}
      {...props}
    >
      {icon && (
        <span className="mt-0.5 shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      )}
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-0.5 shrink-0 rounded-sm p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
)
InlineBanner.displayName = "InlineBanner"

export { InlineBanner, inlineBannerVariants }
