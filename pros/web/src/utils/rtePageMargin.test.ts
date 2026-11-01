import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clampMarginMm,
  cssPageMargin,
  defaultPageMargin,
  readPageMargin,
  screenMargin,
  writePageMargin,
} from './rtePageMargin.ts'

assert.equal(clampMarginMm(100), 80)
assert.equal(clampMarginMm(-3), 0)
assert.equal(clampMarginMm(12.76), 12.8)
assert.equal(defaultPageMargin(false).preset, 'none')
assert.equal(defaultPageMargin(true).right, 31.8)
assert.equal(readPageMargin(undefined, 'p', false).preset, 'none')
assert.equal(readPageMargin(undefined, 'p', true).preset, 'normal')
assert.equal(writePageMargin(undefined, 'p', defaultPageMargin(true), true), undefined)
assert.equal(writePageMargin(undefined, 'p', defaultPageMargin(false), false), undefined)
assert.deepEqual(writePageMargin(undefined, 'p', { preset: 'narrow', top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 }, true), {
  p: { preset: 'narrow', top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
})
assert.equal(
  writePageMargin(
    { p: { preset: 'narrow', top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 } },
    'p',
    defaultPageMargin(true),
    true,
  ),
  undefined,
)
assert.deepEqual(screenMargin({ preset: 'normal', top: 25.4, right: 31.8, bottom: 25.4, left: 31.8 }, true), {
  top: 0,
  right: 31.8,
  bottom: 0,
  left: 31.8,
})
assert.equal(cssPageMargin({ top: 1, right: 2, bottom: 3, left: 4 }), '1mm 2mm 3mm 4mm')
assert.equal(cssPageMargin({ top: 999, right: -1, bottom: 0, left: 12.74 }), '80mm 0mm 0mm 12.7mm')

const editorCss = readFileSync(new URL('../components/RichTextEditor.vue', import.meta.url), 'utf8')
assert.match(
  editorCss,
  /\.rte-root\.expanded:not\(\[data-page-size='full'\]\):not\(\.is-page-sheet\) :deep\(\.ProseMirror\)/,
)
assert.match(editorCss, /\.rte-root\.is-page-sheet \.rte-body \{[^}]*display:\s*flex;/)
assert.match(
  editorCss,
  /\.rte-root\.is-page-sheet \.rte-body > \.ProseMirror[\s\S]*?max-width:\s*none !important;[\s\S]*?padding:\s*0 !important;/,
)
assert.match(editorCss, /\.rte-root\[data-page-size='full'\]\.expanded :deep\(\.ProseMirror\) \{[^}]*max-width:\s*none;/)
assert.doesNotMatch(
  editorCss,
  /\.rte-root\.is-page-sheet \.rte-body > \.ProseMirror[\s\S]{0,400}max-width:\s*760px/,
)

console.log('page margin ok')
