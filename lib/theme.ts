/**
 * Light, dark, or follow the system. The choice lives in localStorage; the
 * inline script in the root layout applies it before first paint, so a dark
 * page never flashes white.
 */
export type ThemePref = 'light' | 'dark' | 'system'

export const THEME_KEY = 'jevlab.theme.v1'

/** Runs in <head> before hydration. Kept tiny and dependency-free. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref: ThemePref, animate = true) {
  const root = document.documentElement
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (animate && !reduced) {
    root.classList.add('theme-switching')
    window.setTimeout(() => root.classList.remove('theme-switching'), 260)
  }
  root.classList.toggle('dark', dark)
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, pref)
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}
