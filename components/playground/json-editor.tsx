'use client'

import * as React from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, placeholder as cmPlaceholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { linter, lintGutter } from '@codemirror/lint'
import { tags } from '@lezer/highlight'

/**
 * A JSON editor that never fights the person typing.
 *
 * It is uncontrolled: the parent hands it a value, and it only replaces the
 * document when that value changes for a reason other than this editor's own
 * typing (a preset load, a shared link, a form edit). A controlled textarea
 * that re-formatted on every valid keystroke used to throw the cursor to the
 * end mid-word.
 *
 * Loaded lazily by its callers, so the playground's first paint does not wait
 * for CodeMirror.
 */

// Sage tokens only: ink keys and strings, muted punctuation. Teal is kept for
// links, focus and selection, so it does not colour syntax.
const sageHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: 'hsl(var(--foreground))', fontWeight: '600' },
  { tag: [tags.string], color: 'hsl(var(--foreground))' },
  { tag: [tags.number, tags.bool, tags.null], color: 'hsl(var(--info-text))' },
  { tag: [tags.punctuation, tags.brace, tags.squareBracket, tags.separator], color: 'hsl(var(--muted-foreground))' },
])

const sageTheme = EditorView.theme({
  '&': {
    fontSize: '12.5px',
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
    border: '1px solid hsl(var(--input))',
    borderRadius: 'calc(var(--radius) - 2px)',
  },
  '&.cm-focused': { outline: '2px solid hsl(var(--ring))', outlineOffset: '2px' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '8px 0', caretColor: 'hsl(var(--foreground))' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'hsl(var(--muted-foreground))',
    border: 'none',
    fontFamily: 'var(--font-mono)',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'hsl(var(--muted) / 0.6)' },
  '.cm-scroller': { lineHeight: '1.6' },
  '.cm-placeholder': { color: 'hsl(var(--muted-foreground))' },
})

export interface JsonEditorProps {
  value: string
  onChange: (text: string) => void
  ariaLabel: string
  placeholder?: string
  minHeight?: number
  maxHeight?: number
}

export default function JsonEditor({ value, onChange, ariaLabel, placeholder, minHeight = 140, maxHeight = 520 }: JsonEditorProps) {
  const host = React.useRef<HTMLDivElement>(null)
  const view = React.useRef<EditorView | null>(null)
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange
  /** The last text this editor emitted, so its own echo is not re-applied. */
  const lastEmitted = React.useRef(value)
  /** True while the parent's value is being applied: that is not typing. */
  const applying = React.useRef(false)

  React.useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        indentOnInput(),
        bracketMatching(),
        json(),
        linter(jsonParseLinter(), { delay: 300 }),
        lintGutter(),
        syntaxHighlighting(sageHighlight),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel, 'aria-multiline': 'true' }),
        sageTheme,
        EditorView.theme({
          '&': { minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` },
          '.cm-scroller': { overflow: 'auto' },
        }),
        ...(placeholder ? [cmPlaceholder(placeholder)] : []),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || applying.current) return
          const text = update.state.doc.toString()
          lastEmitted.current = text
          onChangeRef.current(text)
        }),
      ],
    })
    view.current = new EditorView({ state, parent: host.current })
    return () => {
      view.current?.destroy()
      view.current = null
    }
    // Created once; later values arrive through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const v = view.current
    if (!v || value === lastEmitted.current) return
    lastEmitted.current = value
    // Update listeners run synchronously inside dispatch, so the flag covers
    // exactly this replacement and no later keystroke.
    applying.current = true
    try {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    } finally {
      applying.current = false
    }
  }, [value])

  return <div ref={host} />
}
