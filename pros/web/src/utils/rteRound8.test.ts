import assert from 'node:assert/strict'
import {
  DIALOG_FOCUS_SELECTOR,
  docChromeDelay,
  focusDialogRoot,
  pasteVolume,
  previewShortcutAllowed,
  snapshotDue,
  topOpenModal,
} from './rteRound8.ts'

assert.equal(pasteVolume(10), 'ok')
assert.equal(pasteVolume(200_000), 'warn')
assert.equal(pasteVolume(1_200_000), 'reject')
assert.equal(pasteVolume(Number.NaN), 'ok')

assert.equal(previewShortcutAllowed({ key: 'c', alt: false, shift: false }), true)
assert.equal(previewShortcutAllowed({ key: 'b', alt: false, shift: false }), false)
assert.equal(previewShortcutAllowed({ key: 'p', alt: true, shift: false }), true)
assert.equal(previewShortcutAllowed({ key: '\\', alt: true, shift: true }), false)

assert.equal(docChromeDelay(100), 280)
assert.equal(docChromeDelay(20_000), 520)
assert.equal(docChromeDelay(80_000), 900)

assert.equal(snapshotDue(0, 10, 0), true)
assert.equal(snapshotDue(100, 100, 1000), false)
assert.equal(snapshotDue(100, 100, 15000), true)
assert.equal(snapshotDue(100, 190, 10), true)
assert.equal(snapshotDue(100, 120, 10), false)

assert.equal(topOpenModal({ find: true, link: true }, ['link', 'find']), 'link')
assert.equal(topOpenModal({ find: false }, ['find']), null)

let focused = 0
assert.equal(
  focusDialogRoot({
    querySelector: (selector) => {
      assert.equal(selector, DIALOG_FOCUS_SELECTOR)
      return { focus: () => { focused += 1 } }
    },
  }),
  true,
)
assert.equal(focused, 1)
assert.equal(focusDialogRoot(null), false)
assert.equal(focusDialogRoot({ querySelector: () => null }), false)

console.log('feishu round8 guards ok')
