import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRendererProps } from '@tiptap/core'
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { ViewMutationRecord } from '@tiptap/pm/view'

/** 节点视图里操作文档所需的最小视图接口。 */
type TimelineView = {
  state: EditorState
  dispatch: (tr: Transaction) => void
}

/** 时间线节点的一个条目（插入时的初始内容）。 */
export type TimelineItemSeed = {
  /** 时间串：仅日期 `2026-11-25`、仅时间 `09:30:00`、或两者 `2026-11-25 09:30:00`。 */
  time?: string
  title?: string
  body?: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    timeline: {
      insertTimeline: (items?: TimelineItemSeed[]) => ReturnType
      /** 在光标所在节点下方添加一个节点；光标不在时间线里就新建一条时间线。 */
      addTimelineItem: () => ReturnType
      /** 删除光标所在的节点；只有 1 个节点时整条时间线一起删。 */
      deleteTimelineItem: () => ReturnType
    }
  }
}

/** 加号 / 垃圾桶图标（内联 SVG，避免额外依赖）。 */
const ICON_DELETE =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 12h10l1-12"/><path d="M10 11v6M14 11v6"/></svg>'
const ICON_CALENDAR =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>'
const ICON_CLOCK =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
const ICON_PLUS =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 今天的日期（yyyy-MM-dd）。 */
export function todayDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** 当前的时分秒（HH:mm:ss）。 */
export function nowClock(now: Date = new Date()): string {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
}

/** 把时间串拆成日期与时分秒两段；兼容 `2026-11-25 09:30:00` / `2026-11-25T09:30` / 旧值。 */
export function splitTimelineTime(value: string): { date: string; clock: string } {
  const text = String(value || '').trim()
  if (!text) return { date: '', clock: '' }
  const both = text.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}:\d{2}(?::\d{2})?))?$/)
  if (both) return { date: both[1], clock: normalizeClock(both[2] || '') }
  const clockOnly = text.match(/^(\d{1,2}:\d{2}(?::\d{2})?)$/)
  if (clockOnly) return { date: '', clock: normalizeClock(clockOnly[1]) }
  // 旧值（只有年月）当日期看待，值本身保留，编辑时才覆盖。
  if (/^\d{4}-\d{2}$/.test(text)) return { date: text, clock: '' }
  return { date: '', clock: '' }
}

/** 时分秒补齐到 HH:mm:ss。 */
export function normalizeClock(value: string): string {
  const text = String(value || '').trim()
  if (!text) return ''
  const m = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return text
  return `${pad2(Number(m[1]))}:${m[2]}:${m[3] || '00'}`
}

/** 合并日期与时分秒：只填其一就只显示其一，两者都填才显示 `yyyy-MM-dd HH:mm:ss`。 */
export function combineTimelineTime(date: string, clock: string): string {
  const d = String(date || '').trim()
  const c = normalizeClock(clock)
  if (d && c) return `${d} ${c}`
  if (d) return d
  if (c) return c
  return ''
}

/**
 * 解析单框输入的日期时间文本。
 * 支持三种形态：仅日期 `2026-11-25`、仅时间 `09:30:00`、两者 `2026-11-25 09:30:00`（也兼容 `T` 分隔）。
 * 合法返回 { date, clock, valid: true }，非法返回 valid: false（调用方标红且不写入文档）。
 */
export function parseTimelineTimeText(value: string): {
  date: string
  clock: string
  valid: boolean
} {
  const text = String(value || '').trim()
  if (!text) return { date: '', clock: '', valid: true }
  const both = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}:\d{2}(?::\d{2})?))?$/)
  if (both) {
    const date = normalizeDate(`${both[1]}-${both[2]}-${both[3]}`)
    const clock = normalizeClock(both[4] || '')
    if (!date || !isValidDate(date)) return { date: '', clock: '', valid: false }
    if (clock && !isValidClock(clock)) return { date: '', clock: '', valid: false }
    return { date, clock, valid: true }
  }
  const clockOnly = text.match(/^(\d{1,2}:\d{2}(?::\d{2})?)$/)
  if (clockOnly) {
    const clock = normalizeClock(clockOnly[1])
    if (!isValidClock(clock)) return { date: '', clock: '', valid: false }
    return { date: '', clock, valid: true }
  }
  return { date: '', clock: '', valid: false }
}

/** 日期是否合法（yyyy-MM-dd）。 */
export function isValidDate(value: string): boolean {
  const m = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return false
  const [, y, mo, d] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  return (
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(mo) - 1 &&
    date.getDate() === Number(d)
  )
}

/** 时间是否合法（HH:mm 或 HH:mm:ss）。 */
export function isValidClock(value: string): boolean {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return false
  return Number(m[1]) < 24 && Number(m[2]) < 60 && Number(m[3] || 0) < 60
}

/** 日期规范化成 yyyy-MM-dd（补零）。 */
export function normalizeDate(value: string): string {
  const m = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return ''
  return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`
}

/**
 * 从一个解析位置向上找最近的 timeline / timelineItem 祖先。
 * 抽成纯函数是为了能脱离编辑器单测。
 */
export function findTimelineContext(resolved: ResolvedPos): {
  timelinePos: number
  itemPos: number
} {
  let timelinePos = -1
  let itemPos = -1
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth)
    if (itemPos < 0 && node.type.name === 'timelineItem') itemPos = resolved.before(depth)
    if (node.type.name === 'timeline') {
      timelinePos = resolved.before(depth)
      break
    }
  }
  return { timelinePos, itemPos }
}

/** 用当前节点的属性改写某些字段，其余属性原样保留。 */
function setTimelineAttr(view: TimelineView, pos: number, patch: Record<string, string>) {
  const node = view.state.doc.nodeAt(pos)
  if (!node) return
  const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch })
  view.dispatch(tr)
}

/**
 * 删除指定位置的时间线节点。
 * 只剩最后一个节点时把整条时间线一起删掉：
 * ProseMirror 的内容约束是 `timelineItem+`，直接删子节点会被自动补一个空节点，
 * 所以这里显式处理，避免时间线里莫名多出一个空节点。
 */
export function deleteTimelineItemAt(view: TimelineView, itemPos: number): boolean {
  const $pos = view.state.doc.resolve(itemPos)
  if ($pos.depth === 0) return false
  const parent = $pos.parent
  if (parent.type.name !== 'timeline') return false
  const timelinePos = $pos.before($pos.depth)
  const timeline = view.state.doc.nodeAt(timelinePos)
  if (!timeline) return false
  if (parent.childCount <= 1) {
    view.dispatch(view.state.tr.delete(timelinePos, timelinePos + timeline.nodeSize))
    return true
  }
  const item = view.state.doc.nodeAt(itemPos)
  if (!item) return false
  view.dispatch(view.state.tr.delete(itemPos, itemPos + item.nodeSize))
  return true
}

function timelineItemNodeView({ node, getPos, editor }: NodeViewRendererProps) {
  const dom = document.createElement('div')
  dom.className = 'rte-timeline-item'
  dom.setAttribute('data-type', 'timeline-item')

  const head = document.createElement('div')
  head.className = 'rte-timeline-item-head'
  head.setAttribute('contenteditable', 'false')

  // 日期与时间合并为一个输入框：一个框里可以只填日期、只填时间，或两者都填。
  // 用文本框而不是原生 date/time 控件：原生控件的显示格式跟随浏览器语言（会出现 mm/dd/yyyy、09:30 AM），
  // 与需求的 yyyy-MM-dd HH:mm:ss 不一致；原生选择器只作为「点图标弹出的取数面板」。
  const timeInput = document.createElement('input')
  timeInput.type = 'text'
  timeInput.className = 'rte-timeline-time'
  timeInput.placeholder = 'yyyy-MM-dd HH:mm:ss'
  timeInput.title = '日期时间（yyyy-MM-dd HH:mm:ss，可只填日期或只填时间）'
  timeInput.setAttribute('data-rte-field', 'time')

  // 原生选择器：点右侧图标弹出系统日历 / 时钟面板，选完写回输入框。
  const datePicker = document.createElement('input')
  datePicker.type = 'date'
  datePicker.className = 'rte-timeline-picker'
  const clockPicker = document.createElement('input')
  clockPicker.type = 'time'
  clockPicker.step = '1'
  clockPicker.className = 'rte-timeline-picker'

  const datePickBtn = document.createElement('button')
  datePickBtn.type = 'button'
  datePickBtn.className = 'rte-timeline-pick-btn'
  datePickBtn.title = '选择日期'
  datePickBtn.setAttribute('aria-label', '选择日期')
  datePickBtn.innerHTML = ICON_CALENDAR

  const clockPickBtn = document.createElement('button')
  clockPickBtn.type = 'button'
  clockPickBtn.className = 'rte-timeline-pick-btn'
  clockPickBtn.title = '选择时间'
  clockPickBtn.setAttribute('aria-label', '选择时间')
  clockPickBtn.innerHTML = ICON_CLOCK

  const timeBox = document.createElement('span')
  timeBox.className = 'rte-timeline-pick'
  timeBox.append(timeInput, datePickBtn, clockPickBtn, datePicker, clockPicker)

  const titleInput = document.createElement('input')
  titleInput.type = 'text'
  titleInput.className = 'rte-timeline-title'
  titleInput.placeholder = '标题'
  titleInput.setAttribute('data-rte-field', 'title')
  titleInput.value = String(node.attrs.title || '')

  const addBtn = document.createElement('button')
  addBtn.type = 'button'
  addBtn.className = 'rte-timeline-add-item'
  addBtn.title = '在当前节点下方添加节点'
  addBtn.setAttribute('aria-label', '在当前节点下方添加节点')
  addBtn.innerHTML = ICON_PLUS

  const deleteBtn = document.createElement('button')
  deleteBtn.type = 'button'
  deleteBtn.className = 'rte-timeline-del'
  deleteBtn.title = '删除节点'
  deleteBtn.setAttribute('aria-label', '删除节点')
  deleteBtn.innerHTML = ICON_DELETE

  head.append(timeBox, titleInput, addBtn, deleteBtn)

  const contentDOM = document.createElement('div')
  contentDOM.className = 'rte-timeline-item-body'

  dom.append(head, contentDOM)

  /** 把节点属性同步到输入框（输入中时不覆盖，避免打断用户输入）。 */
  const syncTime = (attrs: { time?: string }) => {
    const value = String(attrs.time || '')
    if (document.activeElement !== timeInput && timeInput.value !== value) {
      timeInput.value = value
    }
    const parsed = parseTimelineTimeText(value)
    timeInput.classList.toggle('is-invalid', !!value && !parsed.valid)
  }

  syncTime(node.attrs as { time?: string })

  const commit = (patch: Record<string, string>) => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    setTimelineAttr(editor.view, pos, patch)
  }

  /** 文本框输入：合法才写回文档，非法只标红（失焦回滚）。 */
  const onTimeInput = () => {
    const text = timeInput.value.trim()
    const parsed = parseTimelineTimeText(text)
    timeInput.classList.toggle('is-invalid', !parsed.valid)
    if (!parsed.valid) return
    commit({ time: combineTimelineTime(parsed.date, parsed.clock) })
  }
  timeInput.addEventListener('input', onTimeInput)
  timeInput.addEventListener('blur', () => {
    const parsed = parseTimelineTimeText(timeInput.value.trim())
    if (!parsed.valid) {
      // 非法输入：回滚成节点上的原值
      timeInput.value = String(node.attrs.time || '')
      timeInput.classList.remove('is-invalid')
      return
    }
    const canonical = combineTimelineTime(parsed.date, parsed.clock)
    timeInput.value = canonical
    commit({ time: canonical })
  })
  // 原生选择器：点图标弹出系统面板，选完写回文本框。
  const openPicker = (picker: HTMLInputElement) => {
    try {
      picker.showPicker()
    } catch {
      /* 浏览器不支持 showPicker 时静默降级为手动输入 */
    }
  }
  datePickBtn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openPicker(datePicker)
  })
  clockPickBtn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openPicker(clockPicker)
  })
  // 选完日期：保留已有时间部分，只替换日期
  datePicker.addEventListener('change', () => {
    if (!datePicker.value) return
    const parsed = parseTimelineTimeText(timeInput.value)
    const clock = parsed.valid ? parsed.clock : ''
    const next = combineTimelineTime(normalizeDate(datePicker.value), clock)
    timeInput.value = next
    timeInput.classList.remove('is-invalid')
    commit({ time: next })
  })
  // 选完时间：保留已有日期部分，只替换时间
  clockPicker.addEventListener('change', () => {
    if (!clockPicker.value) return
    const parsed = parseTimelineTimeText(timeInput.value)
    const date = parsed.valid ? parsed.date : ''
    const next = combineTimelineTime(date, normalizeClock(clockPicker.value))
    timeInput.value = next
    timeInput.classList.remove('is-invalid')
    commit({ time: next })
  })
  titleInput.addEventListener('input', () => commit({ title: titleInput.value }))
  timeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      titleInput.focus()
    }
  })
  titleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault()
  })
  addBtn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const pos = getPos()
    if (typeof pos !== 'number') return
    const current = editor.state.doc.nodeAt(pos)
    if (!current) return
    const schema = editor.state.schema
    const item = schema.nodes.timelineItem.create(
      { time: todayDate(), title: '新节点' },
      schema.nodes.paragraph.create(),
    )
    // 插到当前节点后面（中间节点即插在它与下一个节点之间）。
    editor.view.dispatch(editor.state.tr.insert(pos + current.nodeSize, item).scrollIntoView())
    requestAnimationFrame(() => {
      const next = dom.nextElementSibling as HTMLElement | null
      const input = next?.querySelector<HTMLInputElement>('.rte-timeline-title')
      if (!input) return
      input.focus()
      input.select()
    })
  })
  deleteBtn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const pos = getPos()
    if (typeof pos !== 'number') return
    deleteTimelineItemAt(editor.view, pos)
  })

  return {
    dom,
    contentDOM,
    update(updated: ProseMirrorNode) {
      if (updated.type.name !== 'timelineItem') return false
      syncTime(updated.attrs as { time?: string })
      const title = String(updated.attrs.title || '')
      if (titleInput.value !== title) titleInput.value = title
      return true
    },
    stopEvent(event: Event) {
      const target = event.target as HTMLElement | null
      return !!target && !!target.closest('.rte-timeline-item-head')
    },
    ignoreMutation(mutation: ViewMutationRecord) {
      const target = mutation.target as HTMLElement | null
      return !!target && !!target.closest('.rte-timeline-item-head')
    },
  }
}

function timelineNodeView() {
  const dom = document.createElement('div')
  dom.className = 'rte-timeline'
  dom.setAttribute('data-type', 'timeline')

  const list = document.createElement('div')
  list.className = 'rte-timeline-list'

  // 底部「添加节点」按钮已隐藏：每个节点自带的「＋」即可在它下面续接节点。
  dom.append(list)

  return {
    dom,
    contentDOM: list,
    stopEvent() {
      return false
    },
    ignoreMutation() {
      return false
    },
  }
}

export const TimelineItem = Node.create({
  name: 'timelineItem',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      time: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-time') || '',
        renderHTML: (attrs: { time?: string }) =>
          attrs.time ? { 'data-time': attrs.time } : {},
      },
      title: {
        default: '节点',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || '节点',
        renderHTML: (attrs: { title?: string }) => ({
          'data-title': attrs.title || '节点',
        }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="timeline-item"]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const time = String(node.attrs.time || '')
    const title = node.attrs.title || '节点'
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'timeline-item',
        class: 'rte-timeline-item',
      }),
      [
        'div',
        { class: 'rte-timeline-item-head', contenteditable: 'false' },
        time ? ['span', { class: 'rte-timeline-time' }, time] : ['span', {}],
        ['span', { class: 'rte-timeline-title' }, title],
      ],
      ['div', { class: 'rte-timeline-item-body' }, 0],
    ]
  },
  addNodeView() {
    return timelineItemNodeView
  },
})

export const Timeline = Node.create({
  name: 'timeline',
  group: 'block',
  content: 'timelineItem+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="timeline"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'timeline',
        class: 'rte-timeline',
      }),
      0,
    ]
  },

  addNodeView() {
    return timelineNodeView
  },

  addCommands() {
    return {
      insertTimeline:
        (items) =>
        ({ commands }) => {
          const list =
            items && items.length
              ? items
              : [
                  { time: todayDate(), title: '启动', body: '项目启动' },
                  { time: '', title: '里程碑', body: '阶段性交付' },
                  { time: '', title: '收尾', body: '复盘归档' },
                ]
          return commands.insertContent({
            type: this.name,
            content: list.map((it) => ({
              type: 'timelineItem',
              attrs: {
                time: it.time || '',
                title: it.title || '节点',
              },
              content: [
                {
                  type: 'paragraph',
                  content: it.body
                    ? [{ type: 'text', text: it.body }]
                    : [],
                },
              ],
            })),
          })
        },
      addTimelineItem:
        () =>
        ({ state, dispatch }) => {
          if (!dispatch) return false
          const { timelinePos, itemPos } = findTimelineContext(state.selection.$from)
          const schema = state.schema
          const item = schema.nodes.timelineItem.create(
            { time: todayDate(), title: '新节点' },
            schema.nodes.paragraph.create(),
          )
          if (itemPos >= 0) {
            // 光标在某个节点里：插到该节点下面（中间节点即插在它与下一个节点之间）。
            const current = state.doc.nodeAt(itemPos)
            if (!current) return false
            dispatch(state.tr.insert(itemPos + current.nodeSize, item).scrollIntoView())
            return true
          }
          if (timelinePos >= 0) {
            const timeline = state.doc.nodeAt(timelinePos)
            if (!timeline) return false
            dispatch(
              state.tr.insert(timelinePos + timeline.nodeSize - 1, item).scrollIntoView(),
            )
            return true
          }
          // 光标不在时间线里：在当前顶层块后面插入一条新时间线。
          const newTimeline = schema.nodes.timeline.create(null, [item])
          const $from = state.selection.$from
          const insertAt = $from.depth > 0 ? $from.after(1) : state.doc.content.size
          dispatch(state.tr.insert(insertAt, newTimeline).scrollIntoView())
          return true
        },
      deleteTimelineItem:
        () =>
        ({ state, dispatch }) => {
          if (!dispatch) return false
          const { timelinePos, itemPos } = findTimelineContext(state.selection.$from)
          if (timelinePos < 0 || itemPos < 0) return false
          return deleteTimelineItemAt({ state, dispatch }, itemPos)
        },
    }
  },
})
