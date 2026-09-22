/** Five pastel fills, used in order on sets of key tiles (literal classes so Tailwind keeps them). */
export const PASTELS = ['bg-pastel-1', 'bg-pastel-2', 'bg-pastel-3', 'bg-pastel-4', 'bg-pastel-5'] as const

export const pastel = (i: number) => PASTELS[((i % PASTELS.length) + PASTELS.length) % PASTELS.length]

/** A stable pastel for a label, so the same card keeps its colour. */
export function pastelFor(label: string) {
  let h = 0
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) | 0
  return pastel(Math.abs(h))
}
