export function normalizeLatex(latex) {
  const raw = String(latex || '')

  return raw
    .replace(/\u0008([A-Za-z]+)/g, String.raw`\\b$1`)
    .replace(/\u000c([A-Za-z]+)/g, String.raw`\\f$1`)
    .replace(/\r([A-Za-z]+)/g, String.raw`\\r$1`)
    .replace(/\t([A-Za-z]+)/g, String.raw`\\t$1`)
    .replace(/\u000b([A-Za-z]+)/g, String.raw`\\v$1`)
    .trim()
}

export function latexFallbackText(latex, fallbackText = '') {
  const normalized = normalizeLatex(latex)
  if (!normalized) {
    return fallbackText || '-'
  }

  return fallbackText || normalized.replace(/\\/g, '')
}

export function shouldRenderAsMath(value) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return false
  }

  if (/[\\_^{}]/.test(normalized)) {
    return true
  }

  if (/\s/.test(normalized)) {
    return false
  }

  return /^[A-Za-z0-9()[\].,+\-=%]+$/.test(normalized)
}
