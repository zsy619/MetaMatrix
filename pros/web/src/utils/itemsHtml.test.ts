import assert from 'node:assert/strict'
import { htmlToBlockTexts, itemsToHtml, syncItemsFromHtml } from './itemsHtml.ts'
import type { QuadrantItem } from '../types/canvas.ts'

assert.deepEqual(htmlToBlockTexts('<p></p>'), [])
assert.deepEqual(htmlToBlockTexts('<p></p><p></p>'), [])
assert.deepEqual(htmlToBlockTexts('<p>甲</p><p></p>'), ['<p>甲</p>', '<p></p>'])
assert.deepEqual(htmlToBlockTexts('<hr>'), ['<hr>'])

const glued = '<p></p><p>/在此填写定性定量方法…</p>'
assert.deepEqual(htmlToBlockTexts(glued), ['<p></p>', '<p>/在此填写定性定量方法…</p>'])

const items: QuadrantItem[] = [{ id: 'a', text: '在此填写定性定量方法…' }]
syncItemsFromHtml(items, glued, {
  update: (id, text) => {
    const item = items.find((row) => row.id === id)
    if (item) item.text = text
  },
  add: (text) => {
    const item = { id: `n${items.length}`, text }
    items.push(item)
    return item
  },
  remove: (id) => {
    const index = items.findIndex((row) => row.id === id)
    if (index >= 0) items.splice(index, 1)
  },
})
assert.equal(itemsToHtml(items), glued)
