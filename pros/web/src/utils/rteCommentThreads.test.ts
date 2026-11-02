import assert from 'node:assert/strict'
import {
  authorColor,
  createCommentThread,
  deleteOwnMessage,
  normalizeCommentThreads,
  readCommentThreads,
  replyToThread,
  setThreadResolved,
  visibleThreads,
  writeCommentThreads,
} from './rteCommentThreads.ts'

const author = { id: 'u1', name: '甲' }
const other = { id: 'u2', name: '乙' }

const thread = createCommentThread({
  id: 't1',
  quote: '选中的句子',
  author,
  body: '这里要改',
  now: 10,
})
assert.ok(thread)
assert.equal(thread.resolved, false)
assert.equal(thread.messages.length, 1)
assert.equal(createCommentThread({ quote: 'x', author, body: '  ' }), null)

const replied = replyToThread([thread], 't1', other, '同意', 20)
assert.ok(replied)
assert.equal(replied[0]?.messages.length, 2)
assert.equal(replyToThread([thread], 'missing', other, '同意'), null)

const resolved = setThreadResolved(replied, 't1', true, 30)
assert.equal(resolved[0]?.resolved, true)
assert.equal(resolved[0]?.resolvedAt, 30)
assert.equal(visibleThreads(resolved, false).length, 0)
assert.equal(visibleThreads(resolved, true).length, 1)
const reopened = setThreadResolved(resolved, 't1', false, 40)
assert.equal(reopened[0]?.resolved, false)
assert.equal('resolvedAt' in reopened[0]!, false)

const kept = deleteOwnMessage(replied, 't1', replied[0]!.messages[1]!.id, 'u1')
assert.equal(kept, null)
const droppedReply = deleteOwnMessage(replied, 't1', replied[0]!.messages[1]!.id, 'u2')
assert.ok(droppedReply)
assert.equal(droppedReply.removedThread, false)
assert.equal(droppedReply.threads[0]?.messages.length, 1)
const removed = deleteOwnMessage(droppedReply.threads, 't1', droppedReply.threads[0]!.messages[0]!.id, 'u1')
assert.ok(removed)
assert.equal(removed.removedThread, true)
assert.deepEqual(removed.threads, [])

const map = writeCommentThreads(undefined, 'panel-a', [thread])
assert.equal(readCommentThreads(map, 'panel-a')[0]?.quote, '选中的句子')
assert.equal(writeCommentThreads(map, 'panel-a', []), undefined)
assert.deepEqual(normalizeCommentThreads([{ id: 'x', messages: [] }]), [])
assert.deepEqual(normalizeCommentThreads(null), [])
assert.notEqual(authorColor('u1'), '')
assert.equal(authorColor('u1'), authorColor('u1'))
