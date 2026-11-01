import assert from 'node:assert/strict'
import { TABLE_QUICK_COLS, TABLE_QUICK_ROWS, moveTableGridHover } from './rteTableGrid.ts'

assert.equal(TABLE_QUICK_COLS, 10)
assert.equal(TABLE_QUICK_ROWS, 8)
assert.deepEqual(moveTableGridHover({ rows: 0, cols: 0 }, 'ArrowRight'), { rows: 1, cols: 2 })
assert.deepEqual(moveTableGridHover({ rows: 3, cols: 4 }, 'ArrowDown'), { rows: 4, cols: 4 })
assert.deepEqual(moveTableGridHover({ rows: 1, cols: 1 }, 'ArrowLeft'), { rows: 1, cols: 1 })
assert.deepEqual(moveTableGridHover({ rows: 8, cols: 10 }, 'ArrowDown'), { rows: 8, cols: 10 })
assert.equal(moveTableGridHover({ rows: 3, cols: 4 }, 'Enter'), 'insert')
assert.equal(moveTableGridHover({ rows: 3, cols: 4 }, 'Escape'), 'close')
assert.equal(moveTableGridHover({ rows: 3, cols: 4 }, 'a'), null)

console.log('table grid ok')
