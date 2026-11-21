<script lang="ts">
/** 菜单项：有 children 就是分组（可继续展开），没有就是可点击的动作。 */
export type MenuNode = {
  key: string
  label: string
  icon?: string
  badge?: string
  /** 副标题：模板用途说明。 */
  desc?: string
  children?: MenuNode[]
  action?: () => void
}

/** 触发按钮的位置（视口坐标），菜单贴着他展开。 */
export type MenuAnchor = { left: number; right: number; top: number; bottom: number }
</script>

<script setup lang="ts">
/**
 * 展开式（flyout）菜单：根菜单是一列窄列表，鼠标移到分组上时，
 * 子菜单在右侧浮出，必要时再往右浮一层。不再占一大块面板。
 *
 * 整个菜单（根列表 + 各层浮层）都 Teleport 到 body，避免被侧栏 overflow 裁掉。
 */
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  nodes: MenuNode[]
  visible: boolean
  anchor: MenuAnchor | null
}>()
const emit = defineEmits<{ select: [node: MenuNode]; close: [] }>()

const keyword = ref('')

/** 一个已展开的分组：node 是分组，rect 是触发它的那个元素的视口位置。 */
interface OpenGroup {
  node: MenuNode
  rect: DOMRect
}

const openGroups = ref<OpenGroup[]>([])
let closeTimer: number | undefined

interface FlatHit {
  node: MenuNode
  path: string
}

function walk(nodes: MenuNode[], trail: string[], out: FlatHit[], query: string) {
  for (const node of nodes) {
    const path = [...trail, node.label]
    if (node.label.toLowerCase().includes(query)) {
      out.push({ node, path: path.join(' / ') })
    } else if (node.children) {
      walk(node.children, path, out, query)
    }
  }
}

const hits = computed<FlatHit[]>(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return []
  const out: FlatHit[] = []
  walk(props.nodes, [], out, query)
  return out
})

const searching = computed(() => hits.value.length > 0)

const rootStyle = computed(() => {
  const a = props.anchor
  if (!a) return {}
  return { left: `${Math.max(a.right - 216, 8)}px`, top: `${a.bottom + 4}px` }
})

watch(
  () => props.visible,
  (on) => {
    if (!on) {
      openGroups.value = []
      keyword.value = ''
    }
  },
)

function cancelClose() {
  if (closeTimer != null) {
    window.clearTimeout(closeTimer)
    closeTimer = undefined
  }
}

/** 移出整个菜单链后延迟关闭，留出移到浮层上的时间。 */
function scheduleClose() {
  cancelClose()
  closeTimer = window.setTimeout(() => {
    openGroups.value = []
  }, 220)
}

/**
 * 展开某个分组。
 * panelIndex 表示它挂在第几块浮层下：0 = 根列表，1 = 第一层浮层。
 */
function openGroup(node: MenuNode, rect: DOMRect, panelIndex: number) {
  if (!node.children?.length) return
  cancelClose()
  openGroups.value = [...openGroups.value.slice(0, panelIndex), { node, rect }]
}

function closeDeeper(panelIndex: number) {
  cancelClose()
  openGroups.value = openGroups.value.slice(0, panelIndex + 1)
}

function onRootEnter(node: MenuNode, event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (node.children?.length) openGroup(node, rect, 0)
  else closeDeeper(-1)
}

function onPanelEnter(node: MenuNode, event: MouseEvent, panelIndex: number) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (node.children?.length) openGroup(node, rect, panelIndex + 1)
  else closeDeeper(panelIndex)
}

function pick(node: MenuNode) {
  if (node.children?.length) return
  emit('select', node)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="mm-menu-root"
      :style="rootStyle"
      @mouseenter="cancelClose"
      @mouseleave="scheduleClose"
    >
      <div class="mm-menu__search">
        <el-input v-model="keyword" size="small" clearable placeholder="搜索模板…">
          <template #prefix>🔍</template>
        </el-input>
      </div>

      <ul v-if="searching" class="mm-menu__list">
        <li v-for="hit in hits" :key="hit.node.key">
          <button type="button" class="mm-menu__item" @click="pick(hit.node)">
            <span class="mm-menu__label">{{ hit.node.icon }} {{ hit.node.label }}</span>
            <span v-if="hit.node.badge" class="mm-menu__badge">{{ hit.node.badge }}</span>
          </button>
          <span class="mm-menu__path">{{ hit.path }}</span>
        </li>
        <li v-if="!hits.length" class="mm-menu__empty">没有匹配的模板</li>
      </ul>

      <ul v-else class="mm-menu__list">
        <li v-for="node in nodes" :key="node.key">
          <button
            type="button"
            class="mm-menu__item"
            @mouseenter="onRootEnter(node, $event)"
            @click="pick(node)"
          >
            <span class="mm-menu__label">{{ node.icon }} {{ node.label }}</span>
            <span v-if="node.children?.length" class="mm-menu__arrow">›</span>
          </button>
        </li>
      </ul>
    </div>

    <div
      v-for="(group, index) in openGroups"
      :key="group.node.key"
      class="mm-flyout"
      :style="{
        left: `${group.rect.right + 4}px`,
        top: `${Math.max(group.rect.top - 6, 8)}px`,
      }"
      @mouseenter="cancelClose"
      @mouseleave="scheduleClose"
    >
      <ul class="mm-menu__list">
        <li v-for="node in group.node.children ?? []" :key="node.key">
          <button
            type="button"
            class="mm-menu__item"
            @mouseenter="onPanelEnter(node, $event, index)"
            @click="pick(node)"
          >
            <span class="mm-menu__label">{{ node.icon }} {{ node.label }}</span>
            <span v-if="node.badge" class="mm-menu__badge">{{ node.badge }}</span>
            <span v-if="node.children?.length" class="mm-menu__arrow">›</span>
          </button>
          <span v-if="node.desc" class="mm-menu__desc">{{ node.desc }}</span>
        </li>
      </ul>
    </div>
  </Teleport>
</template>

<style>
/* 菜单整体在 body 上，脱离 popover 与侧栏的样式作用域。 */
.mm-menu-root,
.mm-flyout {
  position: fixed;
  z-index: 3000;
  padding: 4px;
  background: var(--mm-surface, #fff);
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}
.mm-menu-root {
  width: 216px;
}
.mm-flyout {
  min-width: 200px;
  max-width: 280px;
}
.mm-menu__search {
  padding: 6px;
  border-bottom: 1px solid var(--mm-line, #e5e6eb);
}
.mm-menu__list {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow: auto;
  max-height: 420px;
}
.mm-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
  color: var(--mm-text, #1d2129);
}
.mm-menu__item:hover {
  background: var(--mm-hover, #f2f3f5);
}
.mm-menu__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mm-menu__arrow {
  flex: none;
  color: var(--mm-muted, #86909c);
}
.mm-menu__badge {
  flex: none;
  font-size: 10px;
  color: var(--mm-muted, #86909c);
}
.mm-menu__path {
  display: block;
  padding: 0 8px 4px;
  font-size: 10px;
  color: var(--mm-muted, #86909c);
}
.mm-menu__desc {
  display: block;
  padding: 0 8px 4px 24px;
  font-size: 10px;
  color: var(--mm-muted, #86909c);
}
.mm-menu__empty {
  padding: 10px 8px;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
</style>
