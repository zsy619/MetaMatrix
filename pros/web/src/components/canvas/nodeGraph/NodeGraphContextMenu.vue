<script setup lang="ts">
/**
 * 画布右键菜单（同 excalidraw：按有没有选中给出不同动作）。
 *
 * 位置用 client 坐标 + position: fixed，菜单跟着光标走。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
  Aim,
  ArrowDown,
  Back,
  Bottom,
  BottomRight,
  Brush,
  CaretTop,
  ChatDotRound,
  Coin,
  CollectionTag,
  Connection,
  CopyDocument,
  Crop,
  DataAnalysis,
  DataLine,
  DCaret,
  Delete,
  Document,
  Download,
  EditPen,
  Files,
  Filter,
  Finished,
  Fold,
  Folder,
  FullScreen,
  Grid,
  Guide,
  Help,
  Histogram,
  List,
  Loading,
  Lock,
  Menu,
  Notebook,
  Odometer,
  OfficeBuilding,
  Operation,
  Picture,
  Printer,
  Refresh,
  RefreshLeft,
  RefreshRight,
  ScaleToOriginal,
  Scissor,
  Search,
  Select,
  Share,
  Sort,
  SortDown,
  SortUp,
  Star,
  Sunny,
  Sunrise,
  Switch,
  Tickets,
  Timer,
  Top,
  TrendCharts,
  Unlock,
  ZoomIn,
  ZoomOut,
} from '@element-plus/icons-vue'
import type { GraphNode } from '../../../types/nodeGraph'
import AlignIcon from './AlignIcon.vue'
import { LAYOUT_GROUPS, LAYOUT_LABELS, type LayoutMode } from './layout'

const props = defineProps<{
  x: number
  y: number
  /** 有选中的节点 */
  hasSelection: boolean
  /** 选中了两个以上，可以对齐/分布 */
  multiSelection: boolean
  canUndo: boolean
  canRedo: boolean
  zoomPercent: number
  /** 剪贴板里有节点，才允许「粘贴节点」。 */
  canPaste?: boolean
  /** 右键点在某个节点上时的节点上下文（用于锁定/折叠/配色等）。 */
  node?: GraphNode | null
  /** 是否有可套用的节点样式。 */
  canPasteStyle?: boolean
  /** 只读分享：只留查看、缩放与导出。 */
  readonly?: boolean
}>()

/**
 * 二级菜单（自动排列 / 导出画布）：悬停触发项时在右侧弹出（放不下就翻到左侧）。
 * 排列名称和分组取自 layout.ts；这里只管图标，漏配图标类型检查会报错。
 */
const LAYOUT_ICONS: Record<LayoutMode, Component | string> = {
  grid: Grid,
  snake: Switch,
  honeycomb: Menu,
  compact: ScaleToOriginal,
  wide: FullScreen,
  tall: DCaret,
  columnFirst: 'distribute-h',
  stagger: Operation,
  masonry: Histogram,
  row: 'left',
  column: 'top',
  zigzag: 'center',
  timeline: Timer,
  stairs: TrendCharts,
  diagonal: BottomRight,
  wave: DataLine,
  vee: ArrowDown,
  pyramid: CaretTop,
  funnel: Filter,
  frame: Crop,
  whirl: RefreshRight,
  tree: Files,
  treeReverse: Back,
  layered: SortDown,
  layeredReverse: SortUp,
  mindmap: Share,
  org: OfficeBuilding,
  orgSide: Guide,
  outline: List,
  lanes: 'distribute-v',
  ring: Refresh,
  fan: Odometer,
  spiral: Loading,
  radial: Sunny,
  center: Aim,
  force: Connection,
  concentric: Help,
  ellipse: Coin,
  star: Star,
  sunflower: Sunrise,
  byTitle: Sort,
  byProgress: Finished,
  byType: CollectionTag,
  byGroup: Folder,
  byColor: Brush,
}

const emit = defineEmits<{
  action: [id: string]
  close: []
}>()

/** 菜单位置：贴着光标，但要被视口兜住（贴边时向上/向左翻）。 */
const pos = ref({ x: props.x, y: props.y })
const menuEl = ref<HTMLElement | null>(null)
/** 当前展开的二级菜单；同一时刻只开一个。 */
const openSub = ref<SubKey | null>(null)
const subEl = ref<HTMLElement | null>(null)
const subPos = ref({ x: 0, y: 0 })
const showColors = ref(false)

/** 节点配色预设：6 个色相，够用且不喧宾夺主。 */
const NODE_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#475569']

function fitToViewport() {
  const node = menuEl.value
  if (!node) return
  const rect = node.getBoundingClientRect()
  const margin = 8
  let x = props.x
  let y = props.y
  if (x + rect.width > window.innerWidth - margin) {
    x = Math.max(margin, window.innerWidth - rect.width - margin)
  }
  if (y + rect.height > window.innerHeight - margin) {
    y = Math.max(margin, window.innerHeight - rect.height - margin)
  }
  pos.value = { x, y }
}

onMounted(() => void nextTick(fitToViewport))
watch(() => [props.x, props.y], () => void nextTick(fitToViewport))
// 配色条展开后菜单变高，重新兜一次视口。
watch(showColors, () => void nextTick(fitToViewport))

/**
 * 子菜单延迟收起：鼠标从触发项斜着移向子菜单下方的项时会扫过主菜单的其它项，
 * 立刻收起就永远点不到，留 250ms 让指针走到子菜单里。
 */
let closeTimer = 0
function keepSub() {
  window.clearTimeout(closeTimer)
}
function closeSubSoon() {
  keepSub()
  closeTimer = window.setTimeout(() => (openSub.value = null), 250)
}
onBeforeUnmount(keepSub)

/** 弹出二级菜单：贴着触发项，右侧放不下翻到左侧，纵向夹在视口内。 */
function showSub(key: SubKey, event: Event) {
  const trigger = (event.currentTarget as HTMLElement).getBoundingClientRect()
  keepSub()
  openSub.value = key
  void nextTick(() => {
    const menu = menuEl.value?.getBoundingClientRect()
    const sub = subEl.value?.getBoundingClientRect()
    if (!menu || !sub) return
    const margin = 8
    // 与主菜单重叠 4px，鼠标横移过去不会经过空隙而收起。
    const right = menu.right - 4
    const x = right + sub.width > window.innerWidth - margin ? Math.max(margin, menu.left - sub.width + 4) : right
    const y = Math.max(margin, Math.min(trigger.top - 5, window.innerHeight - sub.height - margin))
    subPos.value = { x, y }
  })
}

type SubKey = 'layout' | 'export'

type Item = {
  id: string
  label: string
  sep?: boolean
  disabled?: boolean
  /** 有二级菜单：点击/悬停展开，不直接触发动作。 */
  sub?: SubKey
  /** Element Plus 图标组件。 */
  icon?: Component
  /** 对齐类图标（AlignIcon 的图形名）。 */
  alignIcon?: string
}

const items = computed<Item[]>(() => {
  const list: Item[] = []
  const node = props.node
  if (props.readonly) {
    return [
      { id: 'fit', label: '适应画布', icon: Aim },
      { id: 'zoom-out', label: '画布缩小', icon: ZoomOut },
      { id: 'zoom-in', label: '画布放大', icon: ZoomIn },
      { id: 'reset-zoom', label: '缩放重置100%', icon: ZoomIn },
      { id: 'search', label: '搜索节点', icon: Search, sep: true },
      { id: 'stats', label: '画布统计', icon: DataAnalysis },
      { id: 'export-sub', label: '导出画布', icon: Download, sub: 'export', sep: true },
    ]
  }
  if (props.hasSelection) {
    if (node) {
      list.push({ id: 'rename', label: '重命名节点', icon: EditPen })
      list.push({ id: 'duplicate', label: '快速克隆', icon: CopyDocument })
      list.push({
        id: 'node-lock',
        label: node.locked ? '解锁节点' : '锁定节点',
        icon: node.locked ? Unlock : Lock,
      })
      list.push({
        id: 'node-collapse',
        label: node.collapsed ? '展开节点' : '折叠节点',
        icon: Fold,
      })
      list.push({ id: 'node-color', label: '节点配色', icon: Brush })
      list.push({ id: 'node-front', label: '置于顶层', icon: Top })
      list.push({ id: 'node-back', label: '置于底层', icon: Bottom })
      list.push({ id: 'copy-style', label: '复制样式', icon: CopyDocument })
      list.push({
        id: 'paste-style',
        label: '套用样式',
        icon: Brush,
        disabled: !props.canPasteStyle,
      })
      if (props.multiSelection) {
        list.push({ id: 'group', label: '编组节点', icon: Fold })
      } else if (node.groupId) {
        list.push({ id: 'ungroup', label: '取消编组', icon: Fold })
      }
      list.push({ id: 'comments', label: '节点评论', icon: ChatDotRound, sep: true })
    }
    list.push({ id: 'copy', label: '复制节点', icon: CopyDocument })
    list.push({ id: 'cut', label: '剪切节点', icon: Scissor })
    list.push({ id: 'delete', label: '删除节点', icon: Delete })
    list.push({ id: 'selectAll', label: '全选', icon: Select, sep: true })
    if (props.multiSelection) {
      list.push({ id: 'align-left', label: '左对齐', alignIcon: 'left' })
      list.push({ id: 'align-center', label: '水平居中对齐', alignIcon: 'center' })
      list.push({ id: 'align-right', label: '右对齐', alignIcon: 'right' })
      list.push({ id: 'align-top', label: '顶对齐', alignIcon: 'top' })
      list.push({ id: 'align-middle', label: '垂直居中对齐', alignIcon: 'middle' })
      list.push({ id: 'align-bottom', label: '底对齐', alignIcon: 'bottom' })
    }
    list.push({ id: 'layout-sub', label: '自动排列', icon: Grid, sub: 'layout', sep: true })
    list.push({ id: 'fit', label: '适应画布', icon: Aim, sep: true })
    list.push({ id: 'zoom-out', label: '画布缩小', icon: ZoomOut })
    list.push({ id: 'zoom-in', label: '画布放大', icon: ZoomIn })
  } else {
    list.push({ id: 'add-text', label: '新建富文本节点', icon: Document })
    list.push({ id: 'add-canvas', label: '新建画布节点', icon: Grid })
    list.push({ id: 'paste', label: '粘贴节点', icon: CopyDocument, disabled: !props.canPaste })
    list.push({ id: 'selectAll', label: '全选', icon: Select, sep: true })
    list.push({ id: 'layout-sub', label: '自动排列', icon: Grid, sub: 'layout', sep: true })
    list.push({ id: 'fit', label: '适应画布', icon: Aim })
    list.push({ id: 'zoom-out', label: '画布缩小', icon: ZoomOut })
    list.push({ id: 'zoom-in', label: '画布放大', icon: ZoomIn })
    list.push({ id: 'reset-zoom', label: '缩放重置100%', icon: ZoomIn })
  }
  list.push({ id: 'search', label: '搜索节点', icon: Search, sep: true })
  list.push({ id: 'stats', label: '画布统计', icon: DataAnalysis })
  list.push({ id: 'export-sub', label: '导出画布', icon: Download, sub: 'export', sep: true })
  list.push({ id: 'undo', label: '撤销', icon: RefreshLeft, sep: true, disabled: !props.canUndo })
  list.push({ id: 'redo', label: '重做', icon: RefreshRight, disabled: !props.canRedo })
  return list
})

/** 导出二级菜单：只读不给 JPG 与选中导出（和合并前一致）。 */
const exportGroups = computed<{ title: string; items: Item[] }[]>(() => {
  const full = !props.readonly
  return [
    {
      title: '图片',
      items: [
        { id: 'export-png', label: 'PNG 位图', icon: Picture },
        ...(full ? [{ id: 'export-jpg', label: 'JPG 位图', icon: Picture }] : []),
        { id: 'export-svg', label: 'SVG 矢量', icon: Share },
      ],
    },
    ...(full && props.hasSelection
      ? [
          {
            title: '选中',
            items: [
              { id: 'export-selection-png', label: '选中 PNG', icon: Picture },
              { id: 'export-selection-svg', label: '选中 SVG', icon: Share },
            ],
          },
        ]
      : []),
    {
      title: '文档',
      items: [
        { id: 'export-json', label: 'JSON 数据', icon: Tickets },
        { id: 'export-markdown', label: 'Markdown 笔记', icon: Notebook },
        { id: 'export-print', label: 'PDF 打印', icon: Printer },
      ],
    },
  ]
})

const subGroups = computed<{ title: string; items: Item[] }[]>(() =>
  openSub.value === 'export'
    ? exportGroups.value
    : LAYOUT_GROUPS.map((group) => ({
        title: group.title,
        items: group.modes.map((mode) => {
          const icon = LAYOUT_ICONS[mode]
          return {
            id: 'layout-' + mode,
            label: LAYOUT_LABELS[mode],
            ...(typeof icon === 'string' ? { alignIcon: icon } : { icon }),
          }
        }),
      })),
)
</script>

<template>
  <div
    ref="menuEl"
    class="ng-ctx"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    role="menu"
    @click.stop
    @scroll="openSub = null"
  >
    <template v-for="item in items" :key="item.id">
      <button
        type="button"
        class="ng-ctx__item"
        :class="{ 'is-sep': item.sep, 'is-disabled': item.disabled }"
        role="menuitem"
        :disabled="item.disabled"
        :aria-haspopup="item.sub ? 'menu' : undefined"
        :aria-expanded="item.sub ? openSub === item.sub : undefined"
        @click="item.disabled
          ? null
          : item.id === 'node-color'
            ? (showColors = !showColors)
            : item.sub
              ? showSub(item.sub, $event)
              : emit('action', item.id)"
        @mouseenter="item.sub ? showSub(item.sub, $event) : closeSubSoon()"
      >
        <span class="ng-ctx__icon">
          <AlignIcon v-if="item.alignIcon" :icon="item.alignIcon" />
          <el-icon v-else-if="item.icon"><component :is="item.icon" /></el-icon>
        </span>
        <span class="ng-ctx__label">{{ item.label }}</span>
        <span v-if="item.sub" class="ng-ctx__arrow">›</span>
      </button>

      <div v-if="item.id === 'node-color' && showColors" class="ng-ctx__swatches">
        <button
          v-for="color in NODE_COLORS"
          :key="color"
          type="button"
          class="ng-ctx__swatch"
          :style="{ background: color }"
          :title="color"
          :aria-label="'使用颜色 ' + color"
          @click="emit('action', 'node-color:' + color)"
        ></button>
        <button
          type="button"
          class="ng-ctx__swatch ng-ctx__swatch--reset"
          title="恢复默认配色"
          aria-label="恢复默认配色"
          @click="emit('action', 'node-color:')"
        ></button>
      </div>
    </template>

    <!-- 二级菜单：position: fixed，不受主菜单滚动裁剪；排列四列，导出单列 -->
    <div
      v-if="openSub"
      ref="subEl"
      class="ng-ctx ng-ctx__submenu"
      :class="{ 'ng-ctx__submenu--single': openSub === 'export' }"
      :style="{ left: subPos.x + 'px', top: subPos.y + 'px' }"
      role="menu"
      :aria-label="openSub === 'export' ? '导出画布' : '自动排列'"
      @mouseenter="keepSub"
      @mouseleave="closeSubSoon"
    >
      <template v-for="group in subGroups" :key="group.title">
        <div class="ng-ctx__group" role="presentation">{{ group.title }}</div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="ng-ctx__item"
          role="menuitem"
          @click="emit('action', item.id)"
        >
          <span class="ng-ctx__icon">
            <AlignIcon v-if="item.alignIcon" :icon="item.alignIcon" />
            <el-icon v-else-if="item.icon"><component :is="item.icon" /></el-icon>
          </span>
          <span class="ng-ctx__label">{{ item.label }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ng-ctx {
  position: fixed;
  z-index: 60;
  min-width: 176px;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: 6px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14), 0 2px 6px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
}

.ng-ctx__item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1f2937;
  font-size: 13px;
  text-align: left;
  padding: 7px 10px;
  cursor: pointer;
}

/* 图标列固定宽度，所有菜单项文字对齐（同 excalidraw）。 */
.ng-ctx__icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.ng-ctx__item:hover:not(:disabled) .ng-ctx__icon {
  color: #1f2937;
}

.ng-ctx__label {
  flex: 1;
}

.ng-ctx__arrow {
  font-size: 14px;
  color: #9ca3af;
  line-height: 1;
}

/* 外观沿用 .ng-ctx，只压过主菜单的层级。 */
.ng-ctx__submenu {
  z-index: 61;
  display: grid;
  /* 四列：45 种排列在 720 高的视口里不用滚动。 */
  grid-template-columns: repeat(4, minmax(112px, 1fr));
  column-gap: 2px;
}

.ng-ctx__submenu--single {
  grid-template-columns: minmax(148px, 1fr);
}

/* 分组标题占满一行，把子菜单分成几段。 */
.ng-ctx__group {
  grid-column: 1 / -1;
  padding: 6px 10px 2px;
  font-size: 11px;
  color: #9ca3af;
  letter-spacing: 0.04em;
}

.ng-ctx__group:not(:first-child) {
  margin-top: 4px;
  border-top: 1px solid #ececec;
}

.ng-ctx__item:hover:not(:disabled) {
  background: #f1f3f4;
}

.ng-ctx__item.is-disabled {
  opacity: 0.45;
  cursor: default;
}

/* 分隔线：用上边框画在分组之间（同 excalidraw 菜单） */
.ng-ctx__item.is-sep {
  margin-top: 5px;
  padding-top: 9px;
  border-top: 1px solid #ececec;
  border-radius: 0 0 6px 6px;
}

.ng-ctx__swatches {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  padding: 4px 10px 8px 34px;
}

.ng-ctx__swatch {
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 5px;
  cursor: pointer;
}

.ng-ctx__swatch--reset {
  background: #fff;
  border-style: dashed;
}
</style>
