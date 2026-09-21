// Sage design system — Tailwind preset.
// Usage: in your app's tailwind.config.ts → `presets: [require('./sage-design-system/tailwind-preset')]`
// (or spread `sagePreset.theme.extend` into your own extend).
import type { Config } from "tailwindcss";

export const sagePreset = {
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        // Sage is sans-only (Plus Jakarta + JetBrains Mono). serif is aliased to sans.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        // Sage semantic roles
        brand: { DEFAULT: "hsl(var(--brand))", soft: "hsl(var(--brand-soft))", text: "hsl(var(--brand-text))" },
        success: { DEFAULT: "hsl(var(--success))", soft: "hsl(var(--success-soft))", text: "hsl(var(--success-text))" },
        warning: { DEFAULT: "hsl(var(--warning))", soft: "hsl(var(--warning-soft))", text: "hsl(var(--warning-text))" },
        danger: { DEFAULT: "hsl(var(--danger))", soft: "hsl(var(--danger-soft))", text: "hsl(var(--danger-text))" },
        info: { DEFAULT: "hsl(var(--info))", soft: "hsl(var(--info-soft))", text: "hsl(var(--info-text))" },
        dataviz: { primary: "hsl(var(--dataviz-primary))", support: "hsl(var(--dataviz-support))" },
      },
    },
  },
} satisfies Partial<Config>;

export default sagePreset;
