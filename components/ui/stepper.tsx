import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Stepper — a horizontal progress indicator for multi-step flows.
 * Completed = teal fill + check; current = teal ring; upcoming = neutral.
 * (Progress/state is teal's domain per the Sage law.)
 */
export type StepStatus = "complete" | "current" | "upcoming"

export interface Step {
  label: string
  description?: string
}

const Stepper = React.forwardRef<
  HTMLOListElement,
  React.HTMLAttributes<HTMLOListElement> & {
    steps: Step[]
    /** zero-based index of the current step */
    current: number
  }
>(({ className, steps, current, ...props }, ref) => (
  <ol
    ref={ref}
    className={cn("flex w-full items-center", className)}
    {...props}
  >
    {steps.map((step, i) => {
      const status: StepStatus =
        i < current ? "complete" : i === current ? "current" : "upcoming"
      const isLast = i === steps.length - 1

      return (
        <li
          key={step.label}
          className={cn("flex items-center", !isLast && "flex-1")}
        >
          <div className="flex items-center gap-2.5">
            <span
              aria-current={status === "current" ? "step" : undefined}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                status === "complete" &&
                  "border-brand bg-brand text-white",
                status === "current" &&
                  "border-brand bg-brand-soft text-brand-text ring-2 ring-brand/30",
                status === "upcoming" &&
                  "border-border bg-background text-muted-foreground"
              )}
            >
              {status === "complete" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                i + 1
              )}
            </span>
            <div className="flex flex-col">
              <span
                className={cn(
                  "text-sm font-medium",
                  status === "upcoming"
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {step.label}
              </span>
              {step.description && (
                <span className="text-xs text-muted-foreground">
                  {step.description}
                </span>
              )}
            </div>
          </div>
          {!isLast && (
            <span
              className={cn(
                "mx-3 h-px flex-1 transition-colors",
                i < current ? "bg-brand" : "bg-border"
              )}
            />
          )}
        </li>
      )
    })}
  </ol>
))
Stepper.displayName = "Stepper"

export { Stepper }
