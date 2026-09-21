"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * SegmentedControl — a compact single-select switch (iOS-style).
 * Dependency-free. The SELECTED segment lifts on an ink-neutral pill with a
 * teal label (active/selected = teal per the Sage law). Track is muted.
 */
type SegmentedControlContextValue = {
  value: string
  setValue: (v: string) => void
}

const SegmentedControlContext =
  React.createContext<SegmentedControlContextValue | null>(null)

interface SegmentedControlProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: string
  onValueChange: (value: string) => void
}

const SegmentedControl = React.forwardRef<
  HTMLDivElement,
  SegmentedControlProps
>(({ className, value, onValueChange, children, ...props }, ref) => (
  <SegmentedControlContext.Provider
    value={{ value, setValue: onValueChange }}
  >
    <div
      ref={ref}
      role="tablist"
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  </SegmentedControlContext.Provider>
))
SegmentedControl.displayName = "SegmentedControl"

interface SegmentedControlItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const SegmentedControlItem = React.forwardRef<
  HTMLButtonElement,
  SegmentedControlItemProps
>(({ className, value, children, ...props }, ref) => {
  const ctx = React.useContext(SegmentedControlContext)
  if (!ctx) throw new Error("SegmentedControlItem must be used within SegmentedControl")
  const active = ctx.value === value

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? "active" : "inactive"}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        active
          ? "bg-background text-brand shadow-sm"
          : "hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
})
SegmentedControlItem.displayName = "SegmentedControlItem"

export { SegmentedControl, SegmentedControlItem }
