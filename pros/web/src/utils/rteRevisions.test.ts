import assert from 'node:assert/strict'
import {
  REVISION_LIMITS,
  formatRevisionTime,
  normalizeRevisions,
  rememberRevision,
  revisionHtmlIsEmpty,
  writeRevisions,
} from './rteRevisions.ts'

assert.equal(revisionHtmlIsEmpty('<p></p>'), true)
assert.equal(revisionHtmlIsEmpty('<p>甲</p>'), false)
assert.equal(formatRevisionTime(Date.UTC(2026, 10, 2, 7, 5)), '2026-11-02 07:05')

const first = rememberRevision([], '<p>甲</p>', 1_000, { id: 'a' })
assert.equal(first.reason, 'stored')
assert.equal(first.list.length, 1)

const same = rememberRevision(first.list, '<p>甲</p>', 2_000)
assert.equal(same.reason, 'same')
assert.equal(same.list.length, 1)

const named = rememberRevision(first.list, '<p>甲</p>', 3_000, { label: '  送审前  ' })
assert.equal(named.reason, 'labeled')
assert.equal(named.list[0]?.label, '送审前')
assert.equal(named.list[0]?.id, 'a')

const empty = rememberRevision(named.list, '<p><br></p>', 4_000)
assert.equal(empty.reason, 'empty')

const huge = rememberRevision(named.list, `<p>${'文'.repeat(REVISION_LIMITS.htmlChars)}</p>`, 5_000)
assert.equal(huge.reason, 'too-large')
assert.equal(huge.list.length, 1)

let list = named.list
for (let i = 0; i < 20; i += 1) {
  list = rememberRevision(list, `<p>自动${i}</p>`, 10_000 + i, { id: `u${i}` }).list
}
assert.equal(list.filter((item) => !item.label).length, REVISION_LIMITS.unnamed)
assert.equal(list.some((item) => item.label === '送审前'), true)
assert.equal(list.some((item) => item.id === 'u0'), false)
assert.equal(list.some((item) => item.id === 'u19'), true)

for (let i = 0; i < 10; i += 1) {
  list = rememberRevision(list, `<p>里程碑${i}</p>`, 20_000 + i, { id: `n${i}`, label: `版${i}` }).list
}
assert.equal(list.filter((item) => item.label).length, REVISION_LIMITS.named)
assert.equal(list.some((item) => item.id === 'n0'), false)
assert.equal(list.some((item) => item.id === 'n9'), true)

assert.equal(writeRevisions(undefined, 'p1', []), undefined)
assert.deepEqual(writeRevisions(undefined, 'p1', named.list), { p1: named.list })
assert.equal(writeRevisions({ p1: named.list }, 'p1', []), undefined)
assert.deepEqual(
  normalizeRevisions([
    { id: '', html: '<p>x</p>', at: 1 },
    { id: 'ok', html: '<p>乙</p>', at: 2, label: '  ' },
    { id: 'ok', html: '<p>重复</p>', at: 3 },
    { id: 'bad', html: '<p></p>', at: 4 },
  ]),
  [{ id: 'ok', html: '<p>乙</p>', at: 2 }],
)

console.log('revisions ok')
