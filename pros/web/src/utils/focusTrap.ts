const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Keep Tab inside a dialog while it is open. */
export function trapTab(event: KeyboardEvent, root: HTMLElement | null) {
  if (event.key !== 'Tab' || !root) return
  const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
  )
  if (!nodes.length) return
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}
