import assert from 'node:assert/strict'
import { caretDesyncedAtEnd } from './rteCaret.ts'

const text = '在此填写定性定量方法…'
assert.equal(caretDesyncedAtEnd(0, text, text.length, text), true)
assert.equal(caretDesyncedAtEnd(text.length, text, text.length, text), false)
assert.equal(caretDesyncedAtEnd(0, text, 0, text), false)
assert.equal(caretDesyncedAtEnd(0, text, 3, '别的'), false)
