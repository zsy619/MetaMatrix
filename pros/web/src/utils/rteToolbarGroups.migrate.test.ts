/**
 * 旧文档工具栏 / 图表配置迁移回归（P0-4）。
 *
 * 覆盖三代旧画布 JSON：
 * - 最老一代：工具栏只有一个「文字」总入口（group id = text）；
 * - 第二代：已拆成 标题 / 字形 / 颜色 / 对齐 / 列表，图表仍是旧总入口 `echarts`；
 * - 第三代：图表已是 9 个一级分类下拉（chart:xxx）。
 *
 * 验收口径：迁移后 11 个可见分组齐全、无空组无重复；用户曾隐藏的按钮仍然隐藏；
 * 旧分组键（别名表里的每一个）都被覆盖。
 */
import { describe, expect, it } from 'vitest'
import legacyTextSingleEntry from './__fixtures__/legacy-toolbar-text-single-entry.canvas.json'
import legacySplitGroupsEcharts from './__fixtures__/legacy-toolbar-split-groups-echarts.canvas.json'
import legacyChartEntryHidden from './__fixtures__/legacy-toolbar-chart-entry-hidden.canvas.json'
import legacyEchartsEntryOnly from './__fixtures__/legacy-toolbar-echarts-entry-only.canvas.json'
import legacyEchartsInInsert from './__fixtures__/legacy-toolbar-echarts-in-insert.canvas.json'
import {
  CHART_TOOLBAR_KEYS,
  DEFAULT_TOOLBAR_GROUP_ORDER,
  LEGACY_CHART_ENTRY_KEY,
  LEGACY_GROUP_ALIASES,
  TOOLBAR_GROUPS,
  buildToolbarGroups,
  expandLegacyChartKey,
  migrateToolbarGroupButtons,
  normalizeToolbarGroupOrder,
  readToolbarGroupOrder,
} from './rteToolbarGroups.ts'
import {
  normalizeGroupButtonConfig,
  type ToolbarGroupButtonsByPanelId,
} from './rteToolbarGroupButtons.ts'

/** 11 个可见分组（other 是兜底，不算可见分组）。 */
const VISIBLE_GROUP_IDS = DEFAULT_TOOLBAR_GROUP_ORDER.filter((id) => id !== 'other')
const GROUP_BY_ID = new Map(TOOLBAR_GROUPS.map((group) => [group.id, group]))
/** 新方案里全部 105 个按钮 key。 */
const ALL_TOOL_KEYS = TOOLBAR_GROUPS.flatMap((group) => group.keys)

type LegacyDoc = {
  toolbarGroupOrderByPanelId?: Record<string, string[]>
  toolbarGroupButtonsByPanelId?: ToolbarGroupButtonsByPanelId
}

const FIXTURES: Array<{ name: string; doc: LegacyDoc }> = [
  { name: '最老一代（text 单入口）', doc: legacyTextSingleEntry as LegacyDoc },
  { name: '第二代（拆分组 + echarts 总入口）', doc: legacySplitGroupsEcharts as LegacyDoc },
  { name: '第三代（9 个图表分类下拉）', doc: legacyChartEntryHidden as LegacyDoc },
  { name: '旧图表总入口整体隐藏', doc: legacyEchartsEntryOnly as LegacyDoc },
  { name: '旧图表总入口混在链接组里', doc: legacyEchartsInInsert as LegacyDoc },
]

describe('旧画布 JSON → 工具栏迁移', () => {
  it.each(FIXTURES)('$name：分组顺序迁移后 11 组齐全、无重复、无空组', ({ doc }) => {
    const orderMap = doc.toolbarGroupOrderByPanelId
    for (const panelId of Object.keys(orderMap ?? {})) {
      const order = readToolbarGroupOrder(orderMap, panelId)
      // 11 个可见分组齐全
      for (const id of VISIBLE_GROUP_IDS) expect(order).toContain(id)
      // 无重复
      expect(new Set(order).size).toBe(order.length)
      // 无空组：每个可见分组都能在分组定义里查到，且都有按钮
      for (const id of VISIBLE_GROUP_IDS) {
        const def = GROUP_BY_ID.get(id)!
        expect(def).toBeTruthy()
        expect(def.keys.length).toBeGreaterThan(0)
      }
      // 未知旧 id 不会漏进来
      for (const id of order) expect(DEFAULT_TOOLBAR_GROUP_ORDER).toContain(id)
    }
  })

  it.each(FIXTURES)('$name：组内按钮配置迁移后分组合法、无重复按钮', ({ doc }) => {
    const migrated = migrateToolbarGroupButtons(doc.toolbarGroupButtonsByPanelId)
    for (const [panelId, panel] of Object.entries(migrated ?? {})) {
      for (const [groupId, config] of Object.entries(panel)) {
        const def = GROUP_BY_ID.get(groupId)
        expect(def, `${panelId}/${groupId} 必须是已知分组`).toBeTruthy()
        const normalized = normalizeGroupButtonConfig(config, def!.keys)
        // 组内顺序不重复
        expect(new Set(normalized.order).size).toBe(normalized.order.length)
        // 隐藏项必须属于该组
        for (const key of normalized.hidden) expect(def!.keys).toContain(key)
        // 等于默认配置的分组不会被写回画布
        if (normalized.hidden.length === 0) {
          const defaultOrder = normalizeGroupButtonConfig(null, def!.keys).order
          expect(normalized.order).not.toEqual(defaultOrder)
        }
      }
    }
  })

  it.each(FIXTURES)('$name：迁移后工具栏 11 组齐全、无空组、无重复按钮', ({ doc }) => {
    const migrated = migrateToolbarGroupButtons(doc.toolbarGroupButtonsByPanelId)
    for (const panelId of Object.keys(doc.toolbarGroupOrderByPanelId ?? {})) {
      const order = readToolbarGroupOrder(doc.toolbarGroupOrderByPanelId, panelId)
      const config = migrated?.[panelId]
      const groups = buildToolbarGroups(
        ALL_TOOL_KEYS.map((key) => ({ key })),
        order,
        config,
      )
      // other 兜底组没有按钮，会被过滤掉 → 剩下 11 个可见分组
      const ids = groups.map((group) => group.id)
      expect(ids).not.toContain('other')
      expect(ids.length).toBeGreaterThan(0)
      expect(new Set(ids).size).toBe(ids.length)
      for (const group of groups) {
        expect(group.tools.length, `${group.id} 不应是空组`).toBeGreaterThan(0)
      }
      // 所有按钮 key 不重复、都在 105 个 key 之内
      const keys = groups.flatMap((group) => group.tools.map((tool) => tool.key))
      expect(new Set(keys).size).toBe(keys.length)
      for (const key of keys) expect(ALL_TOOL_KEYS).toContain(key)
    }
  })

  it.each(FIXTURES)('$name：迁移是幂等的', ({ doc }) => {
    const once = migrateToolbarGroupButtons(doc.toolbarGroupButtonsByPanelId)
    const twice = migrateToolbarGroupButtons(once)
    expect(twice).toEqual(once)
  })
})

describe('迁移后的隐藏状态', () => {
  it('最老一代：text 组隐藏的 ruby / subscript 仍然隐藏，view 组隐藏的 print / import 落到 file 组', () => {
    const migrated = migrateToolbarGroupButtons(
      (legacyTextSingleEntry as LegacyDoc).toolbarGroupButtonsByPanelId,
    )
    const panel = migrated!['panel-1']!
    expect(panel.style!.hidden).toContain('ruby')
    expect(panel.style!.hidden).toContain('subscript')
    expect(panel.file!.hidden).toContain('print')
    expect(panel.file!.hidden).toContain('import')
    // 旧的导出按钮整体落到新 file 组，旧的 view 组只剩视图类按钮
    expect(panel.file!.order).toEqual(['export', 'print', 'import', 'copyMd'])
    expect(panel.view!.order).not.toContain('export')
    expect(panel.view!.order).not.toContain('print')
    expect(panel.view!.hidden).toEqual([])
  })

  it('第二代：marks 组隐藏的 caseTransform、view 组隐藏的 export 都保留', () => {
    const migrated = migrateToolbarGroupButtons(
      (legacySplitGroupsEcharts as LegacyDoc).toolbarGroupButtonsByPanelId,
    )
    const panel = migrated!['panel-1']!
    expect(panel.style!.hidden).toContain('caseTransform')
    expect(panel.file!.hidden).toContain('export')
  })

  it('旧图表总入口隐藏 → 9 个分类下拉全部隐藏', () => {
    const migrated = migrateToolbarGroupButtons(
      (legacyEchartsEntryOnly as LegacyDoc).toolbarGroupButtonsByPanelId,
    )
    const panel = migrated!['panel-1']!
    expect(panel.charts!.hidden).toEqual([...CHART_TOOLBAR_KEYS])
    expect(panel.charts!.order).toEqual([...CHART_TOOLBAR_KEYS])
  })

  it('旧图表总入口未隐藏 → 迁移后 9 个分类下拉全显示，等于默认配置不写回画布', () => {
    const migrated = migrateToolbarGroupButtons(
      (legacySplitGroupsEcharts as LegacyDoc).toolbarGroupButtonsByPanelId,
    )
    expect(migrated!['panel-1']!.charts).toBeUndefined()
  })

  it('第三代：隐藏的图表分类下拉与 copyMd 仍然隐藏，另一个面板互不影响', () => {
    const migrated = migrateToolbarGroupButtons(
      (legacyChartEntryHidden as LegacyDoc).toolbarGroupButtonsByPanelId,
    )
    const panel = migrated!['panel-1']!
    expect(panel.charts!.hidden).toEqual(['chart:relation', 'chart:gl'])
    expect(panel.file!.hidden).toEqual(['copyMd'])
    expect(migrated!['panel-2']!.table!.hidden).toEqual(['tableCsv'])
  })

  it('旧图表总入口混在链接组里：隐藏它 → 9 个分类下拉全部隐藏；链接组其余按钮不受影响', () => {
    const migrated = migrateToolbarGroupButtons(
      (legacyEchartsInInsert as LegacyDoc).toolbarGroupButtonsByPanelId,
    )
    const panel = migrated!['panel-1']!
    expect(panel.charts!.hidden).toEqual([...CHART_TOOLBAR_KEYS])
    // 链接组里隐藏的二维码仍然隐藏，图表总入口不再算在链接组里
    expect(panel.insert!.hidden).toEqual(['qrcode'])
    expect(panel.insert!.order).not.toContain('echarts')
  })

  it('隐藏的按钮不会出现在迁移后的可见按钮里', () => {
    const migrated = migrateToolbarGroupButtons(
      (legacyTextSingleEntry as LegacyDoc).toolbarGroupButtonsByPanelId,
    )
    const order = readToolbarGroupOrder(
      (legacyTextSingleEntry as LegacyDoc).toolbarGroupOrderByPanelId,
      'panel-1',
    )
    const groups = buildToolbarGroups(
      ALL_TOOL_KEYS.map((key) => ({ key })),
      order,
      migrated?.['panel-1'],
    )
    const visible = new Set(groups.flatMap((group) => group.tools.map((tool) => tool.key)))
    for (const hidden of ['ruby', 'subscript', 'print', 'import']) {
      expect(visible.has(hidden)).toBe(false)
    }
    // 未隐藏的按钮不能丢
    for (const kept of ['bold', 'heading', 'export', 'copyMd', 'zoom']) {
      expect(visible.has(kept)).toBe(true)
    }
  })
})

describe('旧分组键覆盖', () => {
  /** 三代旧画布里出现过的、且当前方案已不存在的分组 id（真正的旧 id）。 */
  const LEGACY_GROUP_IDS = [
    // 最老一代
    'history', 'text', 'color', 'paragraph', 'insert', 'table', 'blocks', 'notes', 'review', 'view', 'other',
    // 拆分之后的第二代
    'type', 'marks', 'align', 'list', 'charts',
  ]

  /**
   * 历史各版本工具栏分组里的全部按钮 key（取自 git 历史里的旧 TOOLBAR_GROUPS）。
   * 用来验证「旧按钮不丢」：每个旧 key 在新方案里都有唯一归属。
   */
  const LEGACY_GROUP_KEYS: Record<string, string[]> = {
    history: ['undo', 'redo', 'find', 'formatPainter', 'pastePlain', 'clear', 'pasteFormat'],
    text: [
      'heading', 'bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'codeInline',
      'fontSize', 'fontFamily', 'lineHeight', 'indent', 'outdent', 'spacing',
      'caseTransform', 'emphasisDot', 'ruby', 'paraStyle', 'headingAutoNum',
    ],
    type: ['heading', 'paraStyle', 'fontSize', 'fontFamily', 'headingAutoNum'],
    marks: [
      'bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'codeInline',
      'emphasisDot', 'caseTransform', 'ruby',
    ],
    color: ['color', 'highlight'],
    align: ['align', 'lineHeight', 'spacing', 'indent', 'outdent', 'firstIndent'],
    list: ['list', 'listStyle'],
    paragraph: ['list', 'listStyle', 'quote', 'align', 'code'],
    // 最早一代里旧图表总入口 `echarts` 还混在链接组里
    insert: [
      'link', 'linkButton', 'image', 'video', 'audio', 'attach', 'linkCard',
      'qrcode', 'emoji', 'specialChars', 'formula', 'echarts',
    ],
    charts: ['echarts'],
    table: ['table', 'tableCsv', 'tableFilter'],
    blocks: [
      'callout', 'hr', 'columns', 'pageBreak', 'toggleBlock', 'blockOps', 'insertDate',
      'form', 'template', 'timeline', 'statusChip', 'progressBar', 'tabsBlock', 'mermaid',
      'snippets', 'crossDoc',
    ],
    notes: [
      'note', 'comment', 'footnote', 'footnoteList', 'captionNum', 'bookmark',
      'mentionBtn', 'mentionPerm', 'xref',
    ],
    review: [
      'spellcheck', 'sensitive', 'revision', 'revisionBase', 'suggest', 'suggestAccept',
      'suggestReject', 'speak', 'speakStop', 'headingCheck', 'linkCheck', 'cjkTip',
    ],
    view: [
      'print', 'import', 'export', 'copyMd', 'viewExtras', 'zoom', 'immersive',
      'outline', 'shortcuts', 'wordStats', 'readTime',
    ],
  }

  it('历史旧版本的每个按钮 key 在新方案里都还有归属（不丢按钮）', () => {
    const known = new Set(ALL_TOOL_KEYS)
    for (const [legacyId, keys] of Object.entries(LEGACY_GROUP_KEYS)) {
      for (const key of keys) {
        if (key === LEGACY_CHART_ENTRY_KEY) continue // 旧图表总入口展开成 9 个分类下拉
        expect(known.has(key), `旧分组 ${legacyId} 的按钮 ${key} 在新方案里没有归属`).toBe(true)
      }
    }
  })

  it('历史旧分组里的每个按钮 key 迁移后落到唯一一个新分组，隐藏状态保留', () => {
    for (const [legacyId, keys] of Object.entries(LEGACY_GROUP_KEYS)) {
      for (const key of keys) {
        const migrated = migrateToolbarGroupButtons({
          p1: { [legacyId]: { order: [key], hidden: [key] } },
        })
        const panel = migrated?.['p1'] ?? {}
        if (key === LEGACY_CHART_ENTRY_KEY) {
          // 旧图表总入口 → 9 个分类下拉全部隐藏
          expect(panel.charts?.hidden, `旧图表总入口 ${legacyId}.${key} 没有展开`).toEqual([
            ...CHART_TOOLBAR_KEYS,
          ])
          continue
        }
        const hits = Object.entries(panel).filter(([, config]) => config.hidden?.includes(key))
        expect(hits.length, `旧分组 ${legacyId} 的按钮 ${key} 迁移后没有落到任何分组`).toBe(1)
        const [groupId] = hits[0]!
        expect(GROUP_BY_ID.get(groupId)!.keys, `${key} 落到了不含它的分组 ${groupId}`).toContain(key)
      }
    }
  })

  it('别名表覆盖三代旧画布里出现过的所有旧分组 id', () => {
    const seen = new Set<string>()
    for (const { doc } of FIXTURES) {
      for (const order of Object.values(doc.toolbarGroupOrderByPanelId ?? {})) {
        for (const id of order) seen.add(id)
      }
      for (const panel of Object.values(doc.toolbarGroupButtonsByPanelId ?? {})) {
        for (const id of Object.keys(panel)) seen.add(id)
      }
    }
    const currentIds = new Set(DEFAULT_TOOLBAR_GROUP_ORDER)
    for (const id of seen) {
      if (currentIds.has(id)) continue // 当前方案的分组 id 本来就能用
      expect(LEGACY_GROUP_ALIASES[id], `旧分组 ${id} 没有别名映射`).toBeTruthy()
    }
    // 别名表本身覆盖了全部历史旧 id
    for (const id of LEGACY_GROUP_IDS) {
      expect(LEGACY_GROUP_ALIASES[id], `旧分组 ${id} 没有别名映射`).toBeTruthy()
    }
    // 别名指向的新分组必须真实存在
    for (const [id, targets] of Object.entries(LEGACY_GROUP_ALIASES)) {
      for (const target of targets) {
        expect(GROUP_BY_ID.get(target), `别名 ${id} → ${target} 指向不存在的分组`).toBeTruthy()
      }
    }
  })

  it('当前方案的每个分组 id 都能被迁移（不会被当成未知旧 id 丢掉）', () => {
    for (const groupId of DEFAULT_TOOLBAR_GROUP_ORDER) {
      const def = GROUP_BY_ID.get(groupId)!
      if (!def.keys.length) {
        // other 是兜底组，没有可配置的按钮
        expect(migrateToolbarGroupButtons({ p1: { [groupId]: { order: [], hidden: [] } } })).toBeUndefined()
        continue
      }
      const migrated = migrateToolbarGroupButtons({
        p1: { [groupId]: { order: [...def.keys], hidden: [def.keys[0]!] } },
      })
      expect(migrated, `${groupId} 的配置迁移后丢了`).toBeTruthy()
      expect(migrated!['p1']![groupId]!.hidden).toContain(def.keys[0]!)
    }
  })

  it('旧分组键都能展开成新分组（顺序迁移不丢分组）', () => {
    for (const [legacyId, targets] of Object.entries(LEGACY_GROUP_ALIASES)) {
      const order = normalizeToolbarGroupOrder([legacyId])
      for (const target of targets) expect(order).toContain(target)
    }
  })

  it('旧分组里的按钮不会因为改名而丢键', () => {
    // 旧 view 组的导出按钮在新方案里归到 file 组
    const order = normalizeToolbarGroupOrder(['view'])
    expect(order).toContain('view')
    expect(order).toContain('file')
  })

  it('旧图表总入口展开成 9 个分类下拉', () => {
    expect(LEGACY_CHART_ENTRY_KEY).toBe('echarts')
    expect(expandLegacyChartKey(LEGACY_CHART_ENTRY_KEY)).toEqual([...CHART_TOOLBAR_KEYS])
    expect(CHART_TOOLBAR_KEYS.length).toBe(9)
    // 旧总入口本身不再是有效按钮 key
    expect(ALL_TOOL_KEYS).not.toContain(LEGACY_CHART_ENTRY_KEY)
  })
})
