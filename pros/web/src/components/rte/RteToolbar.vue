<script setup lang="ts">
import { inject } from 'vue'
import { RTE_BINDINGS } from './bindings'
import { useParentScopeStamp } from './inheritScope'
import { buildChartGroups } from '../../utils/echarts/chartGroups'
import RteColorBoard from './RteColorBoard.vue'

const rte = inject(RTE_BINDINGS)
if (!rte) throw new Error('RteToolbar 必须放在 RichTextEditor 里')
const rteBindings = rte
const vRteFloat = rteBindings.vRteFloat
useParentScopeStamp()

/**
 * 图表一级分类（基础 / 统计 / 关系 / 层级 / 地理 / 金融 / 坐标系 / 组件 / 3D·GL）。
 * 每个分类在工具栏上是独立的下拉按钮，下拉里只列该分类下的具体图表类型。
 */
const echartsGroups = buildChartGroups()
const chartGroupById = new Map(echartsGroups.map((item) => [item.group.id, item]))

/** 工具 key（chart:basic）→ 一级分类 id（basic）。 */
function chartGroupIdOfTool(key: string): string {
  return key.startsWith('chart:') ? key.slice('chart:'.length) : ''
}

/** 某个一级分类下的具体图表类型（类别 + 模板）。 */
function chartCategoriesOf(groupId: string) {
  return chartGroupById.get(groupId)?.categories || []
}

function onRibbonTab(id: string, event: MouseEvent) {
  rteBindings.setRibbonTab(id)
  const toolbar = (event.currentTarget as HTMLElement | null)?.closest('.rte-toolbar')
  toolbar?.querySelector(`[data-group-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function toggleChartGroupMenu(key: string) {
  const wasOpen = rteBindings.echartsGroupMenuKey === key
  rteBindings.echartsGroupMenuKey = wasOpen ? null : key
  if (!wasOpen && rteBindings.echartsOpenCategory !== undefined) {
    rteBindings.echartsOpenCategory = null
  }
}
</script>

<template>
    <div data-rte-own
      class="rte-toolbar"
      :class="{ 'is-one-row': rte.expanded && !rte.toolbarRowsOpen }"
      role="toolbar"
      aria-label="编辑工具栏"
    >
      <div data-rte-own class="rte-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {{ rte.rteAriaStatus }}
      </div>
      <div data-rte-own v-if="rte.expanded" class="rte-ribbon-bar">
        <div data-rte-own class="rte-ribbon-tabs" role="tablist" aria-label="功能区">
          <button data-rte-own
            v-for="tab in rte.ribbonTabs"
            :key="'ribbon-' + tab.id"
            type="button"
            role="tab"
            class="rte-ribbon-tab"
            :class="{ active: rte.ribbonTab === tab.id }"
            :aria-selected="rte.ribbonTab === tab.id"
            @click="onRibbonTab(tab.id, $event)"
          >
            {{ tab.label }}
          </button>
        </div>
        <div data-rte-own class="rte-mode-bar">
          <button data-rte-own
            v-for="opt in rte.VIEW_MODE_OPTIONS"
            :key="'vm-' + opt.id"
            type="button"
            role="tab"
            class="rte-tool rte-view-mode-tool"
            :class="{ active: rte.viewMode === opt.id }"
            :title="opt.title"
            :aria-selected="rte.viewMode === opt.id"
            @click="rte.setViewMode(opt.id)"
          >
            <span data-rte-own class="rte-tool-icon rte-view-mode-glyph" aria-hidden="true">{{
              opt.icon
            }}</span>
            <span data-rte-own class="rte-tool-label">{{ opt.label }}</span>
          </button>
          <button data-rte-own
            v-if="rte.viewMode === 'source' && rte.sourceDirty"
            type="button"
            class="rte-tool rte-view-mode-tool rte-view-mode-apply"
            title="将源码应用到文档"
            @click="rte.applySourceNow"
          >
            <span data-rte-own class="rte-tool-icon rte-view-mode-glyph" aria-hidden="true">↑</span>
            <span data-rte-own class="rte-tool-label">应用</span>
          </button>
          <button data-rte-own
            type="button"
            class="rte-tool rte-view-mode-tool rte-toolbar-fold"
            :aria-expanded="rte.toolbarRowsOpen"
            :title="rte.toolbarRowsOpen ? '收起工具栏面板' : '展开工具栏面板'"
            @click="rte.toggleToolbarRows()"
          >
            <span data-rte-own class="rte-tool-icon rte-view-mode-glyph" aria-hidden="true">{{
              rte.toolbarRowsOpen ? '▴' : '▾'
            }}</span>
            <span data-rte-own class="rte-tool-label">{{ rte.toolbarRowsOpen ? '收起' : '展开' }}</span>
          </button>
        </div>
      </div>
      <div data-rte-own
        class="rte-toolbar-tools"
        :class="{
          'is-drop-end':
            rte.toolbarDropIndex != null &&
            rte.visibleToolbarGroups.length > 0 &&
            rte.toolbarDropIndex === rte.toolbarOrder.indexOf(rte.visibleToolbarGroups[rte.visibleToolbarGroups.length - 1].id) + 1,
        }"
        @dragover.prevent="rte.onToolbarGroupDragOver"
        @drop.prevent="rte.onToolbarGroupDrop"
      >
      <div data-rte-own
        v-for="group in rte.visibleToolbarGroups"
        :key="group.id"
        class="rte-tool-group"
        :title="'右键可设置组内按钮的显隐与顺序'"
        :class="{
          'is-drop-target': rte.toolbarDropIndex === rte.toolbarOrder.indexOf(group.id),
          'is-dragging': rte.toolbarDragSource === group.id,
        }"
        :data-group-id="group.id"
        @contextmenu.prevent="rte.onToolbarGroupContextMenu(group.id, $event)"
      >
        <span data-rte-own class="rte-group-head">
          <button data-rte-own
            v-if="rte.viewMode === 'edit'"
            type="button"
            class="rte-group-handle"
            draggable="false"
            :aria-label="'拖动' + group.label + '分组'"
            title="拖动整组。Alt+左/右也可移动"
            @pointerdown="rte.onToolbarHandlePointerDown(group.id, $event)"
            @pointermove="rte.onToolbarHandlePointerMove"
            @pointerup="rte.onToolbarHandlePointerUp"
            @pointercancel="rte.onToolbarHandlePointerUp"
            @keydown="rte.onToolbarGroupKeydown(group.id, $event)"
          >
            ⠿
          </button>
          <span data-rte-own
            class="rte-group-label"
            @pointerdown="rte.onToolbarHandlePointerDown(group.id, $event)"
            @pointermove="rte.onToolbarHandlePointerMove"
            @pointerup="rte.onToolbarHandlePointerUp"
            @pointercancel="rte.onToolbarHandlePointerUp"
          >{{ group.label }}</span>
        </span>
      <template v-for="t in group.tools" :key="t.key">
        <div data-rte-own
          v-if="t.kind === 'heading'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('heading')"
          @mouseleave="rte.onToolMenuLeave($event, 'heading', () => (rte.headingOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool is-labeled"
            :ref="(el) => rte.setFloatAnchor('heading', el)"
            data-rte-anchor="heading"
            :class="{ active: rte.headingOpen || rte.currentParaStyleLabel !== '正文' }"
            :title="'段落样式：' + rte.currentParaStyleLabel"
            aria-label="段落样式"
            :aria-expanded="rte.headingOpen"
            aria-haspopup="menu"
            @click.stop="rte.openHeadingMenu()"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('heading')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >{{ rte.currentParaStyleLabel }}<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.headingOpen"
              class="rte-menu rte-para-menu"
              v-rte-float="'heading'"
              role="menu"
              aria-label="段落样式"
              @mousedown.prevent
              @keydown="rte.onHeadingMenuKeydown"
              @mouseenter="rte.onToolMenuEnter('heading')"
              @mouseleave="rte.onToolMenuLeave($event, 'heading', () => (rte.headingOpen = false))"
            >
              <template v-for="it in rte.BLOCK_MENU" :key="it.id">
                <div data-rte-own v-if="it.splitBefore" class="rte-menu-sep" aria-hidden="true"></div>
                <div data-rte-own
                  class="rte-para-row"
                  :class="{ 'is-sub-left': rte.blockSubmenuFlip }"
                  @mouseenter="rte.onBlockMenuEnter(it.id)"
                >
                  <button data-rte-own
                    type="button"
                    role="menuitemradio"
                    :data-para-style="it.id"
                    :aria-checked="rte.isBlockMenuActive(it.id)"
                    :aria-haspopup="it.children ? 'menu' : undefined"
                    :aria-expanded="it.children ? rte.blockSubmenuId === it.id : undefined"
                    :class="{
                      active: rte.isBlockMenuActive(it.id),
                      'has-sub': !!it.children,
                    }"
                    @click="rte.applyBlockMenu(it.id)"
                  >
                    <span data-rte-own class="rte-para-mark">{{ it.mark }}</span>
                    <span data-rte-own class="rte-para-preview">{{ it.label }}</span>
                    <span data-rte-own v-if="it.children" class="rte-more-caret" aria-hidden="true">›</span>
                  </button>
                  <div data-rte-own
                    v-if="it.children && rte.blockSubmenuId === it.id"
                    class="rte-para-submenu"
                    role="menu"
                    @mousedown.prevent
                  >
                    <button data-rte-own
                      v-for="child in it.children"
                      :key="child.id"
                      type="button"
                      role="menuitemradio"
                      :data-para-style="child.id"
                      :aria-checked="rte.isBlockMenuActive(child.id)"
                      :class="{ active: rte.isBlockMenuActive(child.id) }"
                      @mouseenter="rte.onBlockMenuEnter(child.id)"
                      @click="rte.applyBlockMenu(child.id)"
                    >
                      <span data-rte-own class="rte-para-mark">{{ child.mark }}</span>
                      <span data-rte-own class="rte-para-preview">{{ child.label }}</span>
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'list'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('list')"
          @mouseleave="rte.onToolMenuLeave($event, 'list', () => (rte.listOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('list', el)" data-rte-anchor="list"
            :class="{
              active:
                rte.isActive('bulletList') ||
                rte.isActive('orderedList') ||
                rte.isActive('taskList'),
            }"
            :title="rte.isActive('taskList') ? '任务列表' : rte.isActive('orderedList') ? '有序列表' : rte.isActive('bulletList') ? '无序列表' : '列表（无序 / 有序 / 任务）'"
            :aria-label="rte.isActive('taskList') ? '任务列表' : rte.isActive('orderedList') ? '有序列表' : rte.isActive('bulletList') ? '无序列表' : '列表'"
            aria-haspopup="menu"
            :aria-expanded="rte.listOpen"
            :aria-pressed="rte.isActive('bulletList') || rte.isActive('orderedList') || rte.isActive('taskList')"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.closeFontMenus(); rte.headingOpen = false; rte.formOpen = false; rte.templateOpen = false; rte.alignOpen = false; rte.listOpen = !rte.listOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own
                :is="rte.isActive('taskList') ? rte.toolIcon('listTask') : rte.isActive('orderedList') ? rte.toolIcon('listOrdered') : rte.toolIcon('list')"
                class="rte-ep-icon"
              />
            </span>
            <span data-rte-own class="rte-tool-label"
              >列表<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.listOpen"
              class="rte-menu"
              v-rte-float="'list'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('list')"
              @mouseleave="rte.onToolMenuLeave($event, 'list', () => (rte.listOpen = false))"
            >
              <button data-rte-own
                type="button"
                :class="{ active: rte.isActive('bulletList') }"
                @click="rte.toggleBulletList(); rte.listOpen = false"
              >
                无序列表
              </button>
              <button data-rte-own
                type="button"
                :class="{ active: rte.isActive('orderedList') }"
                @click="rte.toggleOrderedList(); rte.listOpen = false"
              >
                有序列表
              </button>
              <button data-rte-own
                type="button"
                :class="{ active: rte.isActive('taskList') }"
                @click="rte.toggleTaskList(); rte.listOpen = false"
              >
                任务列表
              </button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" @click="rte.continueOrderedNumbering()">继续之前的编号</button>
              <button data-rte-own type="button" @click="rte.restartOrderedNumbering()">开始新列表</button>
              <button data-rte-own type="button" @click="rte.applyListStart()">修改编号值…</button>
              <button data-rte-own type="button" @click="rte.renumberListFromHere()">从此处重编号</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" @click="rte.applyListStyle('decimal')">数字 1. 2. 3.</button>
              <button data-rte-own type="button" @click="rte.applyListStyle('lower-alpha')">字母 a. b. c.</button>
              <button data-rte-own type="button" @click="rte.applyListStyle('lower-roman')">罗马 i. ii. iii.</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <div data-rte-own v-if="rte.listDepthLabel" class="rte-menu-hint">{{ rte.listDepthLabel }}</div>
              <div data-rte-own class="rte-menu-hint">Tab / Shift+Tab 调整层级</div>
              <button data-rte-own
                type="button"
                @click="rte.indentBlock(); rte.listOpen = false"
              >
                增加缩进
              </button>
              <button data-rte-own
                type="button"
                @click="rte.outdentBlock(); rte.listOpen = false"
              >
                减少缩进
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'form'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('form')"
          @mouseleave="rte.onToolMenuLeave($event, 'form', () => (rte.formOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('form', el)" data-rte-anchor="form"
            :class="{
              active:
                rte.formOpen ||
                rte.isActive('formTextInput') ||
                rte.isActive('formRadioGroup') ||
                rte.isActive('formCheckboxGroup') ||
                rte.isActive('formSelect') ||
                rte.isActive('formTextarea') ||
                rte.isActive('formNumberInput') ||
                rte.isActive('formDateInput') ||
                rte.isActive('formSwitch'),
            }"
            title="表单"
            aria-label="插入表单控件"
            aria-haspopup="menu"
            :aria-expanded="rte.formOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.headingOpen = false; rte.listOpen = false; rte.templateOpen = false; rte.alignOpen = false; rte.formOpen = !rte.formOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('form')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >表单<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.formOpen"
              class="rte-menu"
              v-rte-float="'form'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('form')"
              @mouseleave="rte.onToolMenuLeave($event, 'form', () => (rte.formOpen = false))"
            >
              <button data-rte-own type="button" @click.stop="rte.insertFormRadio()">
                单选组
              </button>
              <button data-rte-own type="button" @click.stop="rte.insertFormCheckbox()">
                多选组
              </button>
              <button data-rte-own type="button" @click.stop="rte.insertFormText()">
                文本输入
              </button>
              <button data-rte-own type="button" @click.stop="rte.insertFormTextarea()">
                多行文本
              </button>
              <button data-rte-own type="button" @click.stop="rte.insertFormNumber()">
                数字输入
              </button>
              <button data-rte-own type="button" @click.stop="rte.insertFormSelect()">
                下拉选择
              </button>
              <button data-rte-own type="button" @click.stop="rte.insertFormDate()">
                日期
              </button>
              <button data-rte-own type="button" @click.stop="rte.insertFormDateTime()">
                日期时间
              </button>
              <button data-rte-own type="button" @click.stop="rte.insertFormSwitch()">
                开关
              </button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" @click.stop="rte.formOpen = false; rte.openTableDialog()">
                表格
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'template'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('template')"
          @mouseleave="rte.onToolMenuLeave($event, 'template', () => (rte.templateOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('template', el)" data-rte-anchor="template"
            :class="{ active: rte.templateOpen }"
            title="插入模板"
            aria-label="插入模板"
            aria-haspopup="menu"
            :aria-expanded="rte.templateOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.headingOpen = false; rte.listOpen = false; rte.formOpen = false; rte.alignOpen = false; rte.templateOpen = !rte.templateOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('template')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >模板<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.templateOpen"
              class="rte-menu rte-template-menu"
              v-rte-float="'template'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('template')"
              @mouseleave="rte.onToolMenuLeave($event, 'template', () => (rte.templateOpen = false))"
            >
              <div data-rte-own class="rte-template-menu-body">
                <template v-for="g in rte.RTE_DOC_TEMPLATE_GROUPS" :key="g.id">
                  <div data-rte-own class="rte-menu-section-label">{{ g.label }}</div>
                  <div data-rte-own class="rte-template-grid">
                    <button data-rte-own
                      v-for="tpl in rte.RTE_DOC_TEMPLATES.filter((x: any) => x.group === g.id)"
                      :key="tpl.id"
                      type="button"
                      class="rte-template-item"
                      :title="tpl.description || tpl.label"
                      @click.stop="rte.insertDocTemplate(tpl.id)"
                    >
                      <span data-rte-own class="rte-template-item-label">{{ tpl.label }}</span>
                      <span data-rte-own v-if="tpl.description" class="rte-template-item-desc">{{
                        tpl.description
                      }}</span>
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'highlight'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('highlight')"
          @mouseleave="rte.onToolMenuLeave($event, 'highlight', () => (rte.highlightOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('highlight', el)" data-rte-anchor="highlight"
            :class="{ active: rte.isActive('highlight') || rte.highlightOpen }"
            title="高亮颜色"
            aria-label="高亮颜色"
            :aria-expanded="rte.highlightOpen"
            aria-haspopup="dialog"
            @click.stop="rte.markToolbarMenuOpening(); rte.toggleHighlightMenu()"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('highlight')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">高亮</span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.highlightOpen"
              class="rte-menu rte-color-menu rte-highlight-menu"
              role="dialog"
              aria-label="高亮颜色"
              v-rte-float="'highlight'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('highlight')"
              @mouseleave="rte.onToolMenuLeave($event, 'highlight', () => (rte.highlightOpen = false))"
            >
              <RteColorBoard data-rte-own kind="highlight" />
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'color'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('color')"
          @mouseleave="rte.onToolMenuLeave($event, 'color', rte.closeColorMenus)"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('color', el)" data-rte-anchor="color"
            :class="{ active: rte.colorOpen }"
            title="文字颜色"
            aria-label="文字颜色"
            :aria-expanded="rte.colorOpen"
            aria-haspopup="dialog"
            @click.stop="rte.markToolbarMenuOpening(); rte.toggleColorMenu()"
          >
            <span data-rte-own
              class="rte-tool-icon rte-color-icon"
              :style="{ textDecorationColor: rte.currentTextColor() || '#1d2129' }"
            >
              <component data-rte-own :is="rte.toolIcon('color')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">颜色</span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.colorOpen"
              class="rte-menu rte-color-menu"
              v-rte-float="'color'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('color')"
              @mouseleave="rte.onToolMenuLeave($event, 'color', rte.closeColorMenus)"
            >
            <RteColorBoard data-rte-own kind="text" />
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'fontSize'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('fontSize')"
          @mouseleave="rte.onToolMenuLeave($event, 'fontSize', () => (rte.fontSizeOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('fontSize', el)" data-rte-anchor="fontSize"
            :class="{ active: rte.fontSizeOpen || !!rte.currentFontSize() }"
            title="字号"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.fontFamilyOpen = false; rte.lineHeightOpen = false; rte.moreFontSizeOpen = false; rte.moreFontFamilyOpen = false; rte.moreLineHeightOpen = false; rte.headingOpen = false; rte.listOpen = false; rte.formOpen = false; rte.templateOpen = false; rte.alignOpen = false; rte.fontSizeOpen = !rte.fontSizeOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('fontSize')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >字号<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.fontSizeOpen"
              class="rte-menu"
              v-rte-float="'fontSize'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('fontSize')"
              @mouseleave="rte.onToolMenuLeave($event, 'fontSize', () => (rte.fontSizeOpen = false))"
            >
              <button data-rte-own
                v-for="opt in rte.FONT_SIZE_OPTIONS"
                :key="'fs-' + opt.label"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentFontSize() || '') }"
                @click="rte.applyFontSize(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'fontFamily'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('fontFamily')"
          @mouseleave="rte.onToolMenuLeave($event, 'fontFamily', () => (rte.fontFamilyOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('fontFamily', el)" data-rte-anchor="fontFamily"
            :class="{ active: rte.fontFamilyOpen || !!rte.currentFontFamily() }"
            title="字体"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.fontSizeOpen = false; rte.lineHeightOpen = false; rte.moreFontSizeOpen = false; rte.moreFontFamilyOpen = false; rte.moreLineHeightOpen = false; rte.headingOpen = false; rte.listOpen = false; rte.formOpen = false; rte.templateOpen = false; rte.alignOpen = false; rte.fontFamilyOpen = !rte.fontFamilyOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('fontFamily')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >字体<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.fontFamilyOpen"
              class="rte-menu rte-font-family-menu"
              v-rte-float="'fontFamily'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('fontFamily')"
              @mouseleave="rte.onToolMenuLeave($event, 'fontFamily', () => (rte.fontFamilyOpen = false))"
            >
              <button data-rte-own
                v-for="opt in rte.FONT_FAMILY_OPTIONS"
                :key="'ff-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentFontFamily() || '') }"
                :style="opt.value ? { fontFamily: opt.value } : undefined"
                @click="rte.applyFontFamily(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'lineHeight'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('lineHeight')"
          @mouseleave="rte.onToolMenuLeave($event, 'lineHeight', () => (rte.lineHeightOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('lineHeight', el)" data-rte-anchor="lineHeight"
            :class="{ active: rte.lineHeightOpen || !!rte.currentLineHeight() }"
            title="行距"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.fontSizeOpen = false; rte.fontFamilyOpen = false; rte.moreFontSizeOpen = false; rte.moreFontFamilyOpen = false; rte.moreLineHeightOpen = false; rte.headingOpen = false; rte.listOpen = false; rte.formOpen = false; rte.templateOpen = false; rte.alignOpen = false; rte.lineHeightOpen = !rte.lineHeightOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('lineHeight')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label"
              >行距<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.lineHeightOpen"
              class="rte-menu"
              v-rte-float="'lineHeight'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('lineHeight')"
              @mouseleave="rte.onToolMenuLeave($event, 'lineHeight', () => (rte.lineHeightOpen = false))"
            >
              <button data-rte-own
                v-for="opt in rte.LINE_HEIGHT_OPTIONS"
                :key="'lh-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentLineHeight() || '') }"
                @click="rte.applyLineHeight(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'linkButton'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('linkButton')"
          @mouseleave="rte.onToolMenuLeave($event, 'linkButton', () => (rte.linkButtonOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('linkButton', el)"
            data-rte-anchor="linkButton"
            :class="{ active: rte.linkButtonOpen || rte.isActive('linkButton') }"
            title="插入打开链接的按钮"
            aria-label="按钮"
            aria-haspopup="menu"
            :aria-expanded="rte.linkButtonOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.listOpen = false; rte.alignOpen = false; rte.linkButtonOpen = !rte.linkButtonOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('linkButton')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">按钮<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.linkButtonOpen"
              class="rte-menu"
              v-rte-float="'linkButton'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('linkButton')"
              @mouseleave="rte.onToolMenuLeave($event, 'linkButton', () => (rte.linkButtonOpen = false))"
            >
              <button data-rte-own
                v-for="tone in rte.LINK_BUTTON_TONES"
                :key="'lb-' + tone.id"
                type="button"
                @click="rte.paintLinkButton(tone.id)"
              >
                {{ tone.label }}按钮
              </button>
              <div data-rte-own v-if="rte.isActive('linkButton')" class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own v-if="rte.isActive('linkButton')" type="button" @click="rte.editLinkButton()">
                修改文字和链接
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'align'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('align')"
          @mouseleave="rte.onToolMenuLeave($event, 'align', () => (rte.alignOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('align', el)" data-rte-anchor="align"
            :class="{
              active:
                rte.isActive({ textAlign: 'center' }) ||
                rte.isActive({ textAlign: 'right' }) ||
                rte.isActive({ textAlign: 'justify' }),
            }"
            title="对齐"
            aria-label="对齐"
            aria-haspopup="menu"
            :aria-expanded="rte.alignOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.closeFontMenus(); rte.headingOpen = false; rte.listOpen = false; rte.formOpen = false; rte.templateOpen = false; rte.alignOpen = !rte.alignOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('align')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">对齐</span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.alignOpen"
              class="rte-menu"
              v-rte-float="'align'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('align')"
              @mouseleave="rte.onToolMenuLeave($event, 'align', () => (rte.alignOpen = false))"
            >
              <button data-rte-own type="button" @click="rte.setAlign('left'); rte.alignOpen = false">
                左对齐
              </button>
              <button data-rte-own type="button" @click="rte.setAlign('center'); rte.alignOpen = false">
                居中
              </button>
              <button data-rte-own type="button" @click="rte.setAlign('right'); rte.alignOpen = false">
                右对齐
              </button>
              <button data-rte-own type="button" @click="rte.setAlign('justify'); rte.alignOpen = false">
                两端对齐
              </button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own type="button" @click="rte.indentBlock(); rte.alignOpen = false">增加缩进</button>
              <button data-rte-own type="button" @click="rte.outdentBlock(); rte.alignOpen = false">减少缩进</button>
              <button data-rte-own
                type="button"
                :class="{ active: rte.currentTextIndent() === '2em' }"
                @click="rte.setFirstLineIndent(true); rte.alignOpen = false"
              >
                首行缩进 2 字
              </button>
              <button data-rte-own
                type="button"
                :disabled="!rte.currentTextIndent()"
                @click="rte.setFirstLineIndent(false); rte.alignOpen = false"
              >
                取消首行缩进
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'divider'"
          class="rte-tool-divider"
          :class="{ 'is-tier': t.key === 'div-tier' }"
          aria-hidden="true"
        />
        <div data-rte-own
          v-else-if="t.kind === 'table'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('table')"
          @mouseleave="rte.onToolMenuLeave($event, 'table', rte.closeTableMenu)"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('table', el)" data-rte-anchor="table"
            :class="{ active: rte.tableMenuOpen || rte.tableQuickOpen || rte.tableDialogOpen || rte.isInTable() }"
            :title="rte.isInTable() ? '表格操作' : '插入表格'"
            aria-label="表格"
            aria-haspopup="menu"
            :aria-expanded="rte.isInTable() ? rte.tableMenuOpen : rte.tableQuickOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.onTableToolbarButtonClick()"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own
                :is="t.iconComp || rte.toolIcon('table')"
                class="rte-ep-icon"
              />
            </span>
            <span data-rte-own class="rte-tool-label"
              >表格<span data-rte-own
                v-if="rte.isInTable()"
                class="rte-caret"
                aria-hidden="true"
              ></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.tableQuickOpen && !rte.isInTable() && rte.viewMode === 'edit'"
              class="rte-menu rte-table-quick"
              :class="{ 'is-dark': rte.darkEditor }"
              v-rte-float="'table'"
              role="menu"
              aria-label="插入表格"
              tabindex="0"
              @mousedown.prevent
              @keydown="rte.onTableQuickKeydown"
              @mouseenter="rte.onToolMenuEnter('table')"
              @mouseleave="rte.onToolMenuLeave($event, 'table', rte.closeTableMenu)"
            >
              <div data-rte-own class="rte-table-quick-label">
                {{ rte.tableQuickHover.rows || 0 }} × {{ rte.tableQuickHover.cols || 0 }} 表格
              </div>
              <div data-rte-own
                class="rte-table-quick-grid"
                @mouseleave="rte.tableQuickHover = { rows: 0, cols: 0 }"
              >
                <button data-rte-own
                  v-for="cell in rte.tableQuickCells"
                  :key="'tq-' + cell.r + '-' + cell.c"
                  type="button"
                  class="rte-table-quick-cell"
                  :class="{ 'is-on': cell.r <= rte.tableQuickHover.rows && cell.c <= rte.tableQuickHover.cols }"
                  :aria-label="cell.r + ' 行 ' + cell.c + ' 列'"
                  @mouseenter="rte.tableQuickHover = { rows: cell.r, cols: cell.c }"
                  @click="rte.insertQuickTable(cell.r, cell.c)"
                />
              </div>
              <button data-rte-own type="button" class="rte-table-quick-more" @click="rte.tableQuickOpen = false; rte.openTableDialog()">
                自定义尺寸…
              </button>
            </div>
            <div data-rte-own
              v-if="rte.tableMenuOpen && rte.isInTable()"
              class="rte-menu rte-table-menu"
              v-rte-float="'table'"
              role="menu"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('table')"
              @mouseleave="rte.onToolMenuLeave($event, 'table', rte.closeTableMenu)"
            >
              <template v-for="op in rte.tableOpItems" :key="op.key">
                <div data-rte-own v-if="op.sepBefore" class="rte-menu-sep" aria-hidden="true" />
                <button data-rte-own
                  type="button"
                  role="menuitem"
                  :class="{ danger: op.danger }"
                  :disabled="op.disabled?.()"
                  @click="op.run()"
                >
                  {{ op.label }}
                </button>
              </template>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <div data-rte-own class="rte-menu-hint-line">拖拽列边缘调整列宽。多选单元格后可合并。</div>
              <div data-rte-own class="rte-table-cell-style-title" style="padding: 4px 10px">单元格背景</div>
              <div data-rte-own class="rte-table-swatches" style="padding: 0 10px 8px">
                <button data-rte-own
                  v-for="p in rte.TABLE_CELL_BG_PRESETS"
                  :key="'menu-bg-' + p.value"
                  type="button"
                  class="rte-table-swatch"
                  :title="p.label"
                  :style="p.value ? { background: p.value } : undefined"
                  @click="rte.setTableCellBg(p.value); rte.closeTableMenu()"
                >{{ p.value ? '' : '无' }}</button>
              </div>
              <button data-rte-own
                type="button"
                role="menuitem"
                @click="rte.closeTableMenu(); rte.openTableDialog()"
              >
                插入表格
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'import'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('import')"
          @mouseleave="rte.onToolMenuLeave($event, 'import', rte.closeImportMenu)"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('import', el)" data-rte-anchor="import"
            :class="{ active: rte.importMenuOpen }"
            title="导入"
            @click.stop="rte.markToolbarMenuOpening(); rte.importMenuOpen = !rte.importMenuOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own
                :is="t.iconComp || rte.toolIcon('import')"
                class="rte-ep-icon"
              />
            </span>
            <span data-rte-own class="rte-tool-label"
              >导入<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.importMenuOpen"
              class="rte-import-menu"
              v-rte-float="'import'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('import')"
              @mouseleave="rte.onToolMenuLeave($event, 'import', rte.closeImportMenu)"
            >
              <button data-rte-own type="button" class="rte-import-item" @click.stop="rte.pickImportDocument">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('importDoc')" class="rte-ep-icon" />
                  <span data-rte-own>导入文档</span>
                </span>
                <span data-rte-own class="rte-import-pill">MD/Doc</span>
              </button>
              <button data-rte-own type="button" class="rte-import-item" @click.stop="rte.openImportLinkDialog">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('importLink')" class="rte-ep-icon" />
                  <span data-rte-own>导入链接</span>
                </span>
                <span data-rte-own class="rte-import-pill">公众号</span>
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'export'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('export')"
          @mouseleave="rte.onToolMenuLeave($event, 'export', rte.closeExportMenu)"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('export', el)" data-rte-anchor="export"
            :class="{ active: rte.exportMenuOpen }"
            title="导出"
            @click.stop="rte.markToolbarMenuOpening(); rte.exportMenuOpen = !rte.exportMenuOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own
                :is="t.iconComp || rte.toolIcon('export')"
                class="rte-ep-icon"
              />
            </span>
            <span data-rte-own class="rte-tool-label"
              >导出<span data-rte-own class="rte-caret" aria-hidden="true"></span
            ></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.exportMenuOpen"
              class="rte-import-menu"
              v-rte-float="'export'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('export')"
              @mouseleave="rte.onToolMenuLeave($event, 'export', rte.closeExportMenu)"
            >
              <button data-rte-own type="button" class="rte-import-item" @click.stop="rte.copyAsFeishuHtml">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportHtml')" class="rte-ep-icon" />
                  <span data-rte-own>复制为 HTML</span>
                </span>
                <span data-rte-own class="rte-import-pill">飞书</span>
              </button>
              <button data-rte-own type="button" class="rte-import-item" @click.stop="rte.exportAsHtml">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportHtml')" class="rte-ep-icon" />
                  <span data-rte-own>导出 HTML</span>
                </span>
                <span data-rte-own class="rte-import-pill">.html</span>
              </button>
              <button data-rte-own type="button" class="rte-import-item" @click.stop="rte.exportAsPlainText">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportText')" class="rte-ep-icon" />
                  <span data-rte-own>导出纯文本</span>
                </span>
                <span data-rte-own class="rte-import-pill">.txt</span>
              </button>
              <button data-rte-own type="button" class="rte-import-item" @click.stop="rte.exportAsMarkdown">
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportText')" class="rte-ep-icon" />
                  <span data-rte-own>导出 Markdown</span>
                </span>
                <span data-rte-own class="rte-import-pill">.md</span>
              </button>
              <button data-rte-own
                type="button"
                class="rte-import-item"
                :disabled="rte.exportBusy"
                @click.stop="rte.exportAsPng"
              >
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportPng')" class="rte-ep-icon" />
                  <span data-rte-own>{{ rte.exportBusy ? '导出中…' : '导出图片' }}</span>
                </span>
                <span data-rte-own class="rte-import-pill">PNG</span>
              </button>
              <button data-rte-own
                type="button"
                class="rte-import-item"
                :disabled="rte.exportBusy"
                @click.stop="rte.exportAsPdf"
              >
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportPdf')" class="rte-ep-icon" />
                  <span data-rte-own>{{ rte.exportBusy ? '导出中…' : '导出 PDF' }}</span>
                </span>
                <span data-rte-own class="rte-import-pill">.pdf</span>
              </button>
              <button data-rte-own
                type="button"
                class="rte-import-item"
                :disabled="rte.exportBusy"
                @click.stop="rte.exportAsDocx"
              >
                <span data-rte-own class="rte-import-left">
                  <component data-rte-own :is="rte.toolIcon('exportDocx')" class="rte-ep-icon" />
                  <span data-rte-own>{{ rte.exportBusy ? '导出中…' : '导出 Word' }}</span>
                </span>
                <span data-rte-own class="rte-import-pill">.docx</span>
              </button>
            </div>
          </Teleport>
        </div>
        <button data-rte-own
          v-else-if="t.kind === 'attach'"
          type="button"
          class="rte-tool"
          :class="{ active: rte.attachDialogOpen }"
          :title="t.title || t.label"
          :aria-label="t.title || t.label"
          aria-haspopup="dialog"
          @click="t.run?.()"
        >
          <span data-rte-own class="rte-tool-icon">
            <component data-rte-own
              :is="t.iconComp || rte.toolIcon('attach')"
              class="rte-ep-icon"
            />
            <span data-rte-own class="rte-caret rte-caret-on-icon" aria-hidden="true"></span>
          </span>
          <span data-rte-own class="rte-tool-label">附件</span>
        </button>
        <div data-rte-own
          v-else-if="t.kind === 'code'"
          class="rte-tool-wrap rte-code-tool-wrap"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :class="{ active: t.active?.() }"
            :title="t.title || t.label"
            :aria-label="t.title || t.label"
            @click="t.run?.()"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own
                v-if="t.iconComp"
                :is="t.iconComp"
                class="rte-ep-icon"
              />
              <template v-else>{{ t.icon }}</template>
            </span>
            <span data-rte-own class="rte-tool-label">{{ t.label }}</span>
          </button>
          <div data-rte-own
            v-if="rte.isActive('codeBlock')"
            class="rte-code-lang-wrap"
            @mouseenter="rte.onToolMenuEnter('codeLang')"
            @mouseleave="rte.onToolMenuLeave($event, 'codeLang', () => (rte.codeLangOpen = false))"
          >
            <button data-rte-own
              type="button"
              class="rte-code-lang-btn"
              :ref="(el) => rte.setFloatAnchor('codeLang', el)"
              data-rte-anchor="codeLang"
              :class="{ active: rte.codeLangOpen }"
              title="代码语言"
              aria-label="代码语言"
              :aria-expanded="rte.codeLangOpen"
              aria-haspopup="listbox"
              @mousedown.prevent
              @click.stop="rte.markToolbarMenuOpening(); rte.codeLangOpen = !rte.codeLangOpen"
            >
              {{ rte.codeLanguageLabel(rte.currentCodeLanguage()) }}
              <span data-rte-own class="rte-caret" aria-hidden="true"></span>
            </button>
            <Teleport to="body">
              <div data-rte-own
                v-if="rte.codeLangOpen"
                class="rte-menu rte-code-lang-menu"
                role="listbox"
                aria-label="代码语言"
                v-rte-float="'codeLang'"
                @mousedown.prevent
                @mouseenter="rte.onToolMenuEnter('codeLang')"
                @mouseleave="rte.onToolMenuLeave($event, 'codeLang', () => (rte.codeLangOpen = false))"
              >
                <button data-rte-own
                  v-for="opt in rte.CODE_LANG_OPTIONS"
                  :key="'cl-' + opt.value"
                  type="button"
                  role="option"
                  :class="{ active: rte.currentCodeLanguage() === opt.value }"
                  :aria-selected="rte.currentCodeLanguage() === opt.value"
                  @click="rte.applyCodeLanguage(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </Teleport>
          </div>
          <button data-rte-own
            v-if="rte.isActive('codeBlock')"
            type="button"
            class="rte-code-flag-btn"
            :class="{ 'is-on': rte.codeBlockFlag('lineNumbers') }"
            :aria-pressed="rte.codeBlockFlag('lineNumbers')"
            title="显示行号"
            aria-label="行号"
            @mousedown.prevent
            @click="rte.toggleCodeBlockFlag('lineNumbers')"
          >
            行号
          </button>
          <button data-rte-own
            v-if="rte.isActive('codeBlock')"
            type="button"
            class="rte-code-flag-btn"
            :class="{ 'is-on': rte.codeBlockFlag('wordWrap') }"
            :aria-pressed="rte.codeBlockFlag('wordWrap')"
            title="自动换行"
            aria-label="自动换行"
            @mousedown.prevent
            @click="rte.toggleCodeBlockFlag('wordWrap')"
          >
            换行
          </button>
          <button data-rte-own
            v-if="rte.isActive('codeBlock')"
            type="button"
            class="rte-code-copy-btn"
            title="复制代码块"
            aria-label="复制代码块"
            @mousedown.prevent
            @click="rte.copyActiveCodeBlock"
          >
            复制
          </button>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'emoji'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('emoji')"
          @mouseleave="rte.onToolMenuLeave($event, 'emoji', () => (rte.emojiOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('emoji', el)"
            data-rte-anchor="emoji"
            :class="{ active: rte.emojiOpen }"
            title="表情"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.closeFontMenus(); rte.specialCharsOpen = false; rte.emojiOpen = !rte.emojiOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('emoji')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">表情<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.emojiOpen"
              class="rte-emoji-panel"
              v-rte-float="'emoji'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('emoji')"
              @mouseleave="rte.onToolMenuLeave($event, 'emoji', () => (rte.emojiOpen = false))"
            >
              <div data-rte-own class="rte-picker-tabs" role="tablist" aria-label="表情分类">
                <button data-rte-own
                  v-for="cat in rte.RTE_EMOJI_CATEGORIES"
                  :key="'em-tab-' + cat.id"
                  type="button"
                  role="tab"
                  class="rte-picker-tab"
                  :class="{ active: rte.emojiTabId === cat.id }"
                  :aria-selected="rte.emojiTabId === cat.id"
                  @click.stop="rte.emojiTabId = cat.id"
                >{{ cat.label }}</button>
              </div>
              <div data-rte-own
                class="rte-picker-grid rte-emoji-grid"
                :class="{ 'rte-emoji-grid--large': rte.isLargeEmojiTab, 'rte-emoji-grid--kaomoji': rte.isKaomojiTab }"
                role="tabpanel"
              >
                <button data-rte-own
                  v-for="em in rte.activeEmojiList"
                  :key="'em-' + rte.emojiTabId + '-' + em"
                  type="button"
                  class="rte-emoji-btn"
                  :class="{ 'rte-emoji-btn--kaomoji': rte.isKaomojiTab || em.includes('(') || em.includes('¯') || em.includes('∠') }"
                  :title="em"
                  @click="rte.insertEmoji(em)"
                >{{ em }}</button>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'specialChars'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('specialChars')"
          @mouseleave="rte.onToolMenuLeave($event, 'specialChars', () => (rte.specialCharsOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('specialChars', el)"
            data-rte-anchor="specialChars"
            :class="{ active: rte.specialCharsOpen }"
            title="字符"
            @click.stop="rte.markToolbarMenuOpening(); rte.closeColorMenus(); rte.closeHighlightMenus(); rte.closeFontMenus(); rte.emojiOpen = false; rte.specialCharsOpen = !rte.specialCharsOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('specialChars')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">字符<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.specialCharsOpen"
              class="rte-specialchars-panel"
              v-rte-float="'specialChars'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('specialChars')"
              @mouseleave="rte.onToolMenuLeave($event, 'specialChars', () => (rte.specialCharsOpen = false))"
            >
              <div data-rte-own class="rte-picker-tabs" role="tablist" aria-label="字符分类">
                <button data-rte-own
                  v-for="cat in rte.RTE_SPECIAL_CHAR_CATEGORIES"
                  :key="'sc-tab-' + cat.id"
                  type="button"
                  role="tab"
                  class="rte-picker-tab"
                  :class="{ active: rte.specialCharTabId === cat.id }"
                  :aria-selected="rte.specialCharTabId === cat.id"
                  @click.stop="rte.specialCharTabId = cat.id"
                >{{ cat.label }}</button>
              </div>
              <div data-rte-own class="rte-picker-grid rte-specialchars-grid" role="tabpanel">
                <button data-rte-own
                  v-for="ch in rte.activeSpecialCharList"
                  :key="'sc-' + rte.specialCharTabId + '-' + ch"
                  type="button"
                  class="rte-specialchars-btn"
                  :title="ch"
                  @click="rte.insertSpecialChar(ch)"
                >{{ ch }}</button>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'columns'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('columns')"
          @mouseleave="rte.onToolMenuLeave($event, 'columns', () => (rte.columnsOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('columns', el)"
            data-rte-anchor="columns"
            :class="{ active: rte.columnsOpen || rte.isActive('columns') }"
            title="多栏布局（2–6 栏）"
            @click.stop="rte.markToolbarMenuOpening(); rte.columnsOpen = !rte.columnsOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('columns')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">分栏<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.columnsOpen"
              class="rte-menu rte-columns-menu"
              v-rte-float="'columns'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('columns')"
              @mouseleave="rte.onToolMenuLeave($event, 'columns', () => (rte.columnsOpen = false))"
            >
              <template v-for="(it, idx) in rte.COLUMN_MENU_ITEMS" :key="idx">
                <div data-rte-own v-if="it.type === 'label'" class="rte-menu-section-label">{{ it.text }}</div>
                <div data-rte-own v-else-if="it.type === 'sep'" class="rte-menu-sep" aria-hidden="true" />
                <button data-rte-own
                  v-else
                  type="button"
                  @click="rte.insertColumns(it.cols, it.ratios)"
                >
                  {{ it.label }}
                </button>
              </template>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'spacing'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('spacing')"
          @mouseleave="rte.onToolMenuLeave($event, 'spacing', () => (rte.spacingOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('spacing', el)"
            data-rte-anchor="spacing"
            :class="{ active: rte.spacingOpen || !!(rte.currentLetterSpacing() || rte.currentMarginTop() || rte.currentMarginBottom()) }"
            title="段前段后 / 字间距"
            @click.stop="rte.markToolbarMenuOpening(); rte.spacingOpen = !rte.spacingOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('spacing')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">段距<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.spacingOpen"
              class="rte-spacing-panel"
              v-rte-float="'spacing'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('spacing')"
              @mouseleave="rte.onToolMenuLeave($event, 'spacing', () => (rte.spacingOpen = false))"
            >
              <div data-rte-own class="rte-spacing-row">
                <span data-rte-own class="rte-spacing-label">段前</span>
                <select data-rte-own
                  class="rte-spacing-select"
                  :value="rte.currentMarginTop()"
                  @change="rte.applyMarginTop(($event.target as HTMLSelectElement).value)"
                >
                  <option data-rte-own value="">默认</option>
                  <option data-rte-own value="0">0</option>
                  <option data-rte-own value="0.5em">0.5em</option>
                  <option data-rte-own value="1em">1em</option>
                  <option data-rte-own value="1.5em">1.5em</option>
                  <option data-rte-own value="2em">2em</option>
                  <option data-rte-own value="3em">3em</option>
                </select>
              </div>
              <div data-rte-own class="rte-spacing-row">
                <span data-rte-own class="rte-spacing-label">段后</span>
                <select data-rte-own
                  class="rte-spacing-select"
                  :value="rte.currentMarginBottom()"
                  @change="rte.applyMarginBottom(($event.target as HTMLSelectElement).value)"
                >
                  <option data-rte-own value="">默认</option>
                  <option data-rte-own value="0">0</option>
                  <option data-rte-own value="0.5em">0.5em</option>
                  <option data-rte-own value="1em">1em</option>
                  <option data-rte-own value="1.5em">1.5em</option>
                  <option data-rte-own value="2em">2em</option>
                  <option data-rte-own value="3em">3em</option>
                </select>
              </div>
              <div data-rte-own class="rte-spacing-row">
                <span data-rte-own class="rte-spacing-label">字间距</span>
                <select data-rte-own
                  class="rte-spacing-select"
                  :value="rte.currentLetterSpacing()"
                  @change="rte.applyLetterSpacing(($event.target as HTMLSelectElement).value)"
                >
                  <option data-rte-own value="">默认</option>
                  <option data-rte-own value="0">0</option>
                  <option data-rte-own value="0.05em">0.05em</option>
                  <option data-rte-own value="0.1em">0.1em</option>
                  <option data-rte-own value="0.15em">0.15em</option>
                  <option data-rte-own value="0.2em">0.2em</option>
                  <option data-rte-own value="0.3em">0.3em</option>
                </select>
              </div>
              <div data-rte-own class="rte-spacing-row">
                <span data-rte-own class="rte-spacing-label">首行缩进</span>
                <select data-rte-own
                  class="rte-spacing-select"
                  :value="rte.currentTextIndent()"
                  @change="rte.applyTextIndent(($event.target as HTMLSelectElement).value)"
                >
                  <option data-rte-own value="">无</option>
                  <option data-rte-own value="2em">2 字符</option>
                  <option data-rte-own value="3em">3 字符</option>
                  <option data-rte-own value="4em">4 字符</option>
                </select>
              </div>
              <div data-rte-own class="rte-spacing-row">
                <span data-rte-own class="rte-spacing-label">文字方向</span>
                <select data-rte-own
                  class="rte-spacing-select"
                  :value="rte.currentTextDir()"
                  @change="rte.applyTextDir(($event.target as HTMLSelectElement).value as '' | 'ltr' | 'rtl')"
                >
                  <option data-rte-own value="">默认</option>
                  <option data-rte-own value="ltr">从左到右</option>
                  <option data-rte-own value="rtl">从右到左</option>
                </select>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'paraStyle'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('paraStyle')"
          @mouseleave="rte.onToolMenuLeave($event, 'paraStyle', () => (rte.paraStyleOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('paraStyle', el)"
            data-rte-anchor="paraStyle"
            :class="{ active: rte.paraStyleOpen }"
            title="段落样式集"
            @click.stop="rte.markToolbarMenuOpening(); rte.paraStyleOpen = !rte.paraStyleOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('fontSize')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">段样式</span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.paraStyleOpen"
              class="rte-menu rte-float-menu"
              v-rte-float="'paraStyle'"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.PARA_STYLE_OPTIONS"
                :key="'ps-' + opt.id"
                type="button"
                @click="rte.applyParaStyleId(opt.id)"
              >
                {{ opt.label }}
                <span data-rte-own class="rte-menu-desc">{{ opt.desc }}</span>
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'listStyle'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('listStyle')"
          @mouseleave="rte.onToolMenuLeave($event, 'listStyle', () => (rte.listStyleOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('listStyle', el)"
            data-rte-anchor="listStyle"
            :class="{ active: rte.listStyleOpen }"
            title="列表编号样式"
            @click.stop="rte.markToolbarMenuOpening(); rte.listStyleOpen = !rte.listStyleOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('list')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">编号样式</span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.listStyleOpen"
              class="rte-menu rte-float-menu"
              v-rte-float="'listStyle'"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.ORDERED_LIST_STYLE_OPTIONS"
                :key="'ls-' + opt.value"
                type="button"
                @click="rte.applyListStyle(opt.value)"
              >
                {{ opt.label }}
              </button>
              <div data-rte-own class="rte-menu-sep" />
              <button data-rte-own type="button" @click="rte.applyListStart()">自定义起始…</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'wordStats'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('wordStats')"
          @mouseleave="rte.onToolMenuLeave($event, 'wordStats', () => (rte.wordStatsOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('wordStats', el)"
            data-rte-anchor="wordStats"
            :class="{ active: rte.wordStatsOpen }"
            title="字数统计"
            @click.stop="rte.markToolbarMenuOpening(); rte.wordStatsOpen = !rte.wordStatsOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('wordStats')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">字数<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.wordStatsOpen"
              class="rte-wordstats-panel"
              v-rte-float="'wordStats'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('wordStats')"
              @mouseleave="rte.onToolMenuLeave($event, 'wordStats', () => (rte.wordStatsOpen = false))"
            >
              <div data-rte-own class="rte-wordstats-title">字数统计</div>
              <div data-rte-own class="rte-wordstats-row"><span data-rte-own>全文（去空白）</span><strong data-rte-own>{{ rte.charCount }}</strong></div>
              <div data-rte-own class="rte-wordstats-row"><span data-rte-own>词数（估）</span><strong data-rte-own>{{ rte.wordCount }}</strong></div>
              <div data-rte-own class="rte-wordstats-row"><span data-rte-own>阅读约</span><strong data-rte-own>{{ rte.readingMinutes }} 分钟</strong></div>
              <div data-rte-own class="rte-wordstats-divider" />
              <div data-rte-own class="rte-wordstats-row"><span data-rte-own>段落</span><strong data-rte-own>{{ rte.docExtraStats.paragraphs }}</strong></div>
              <div data-rte-own class="rte-wordstats-row"><span data-rte-own>行数</span><strong data-rte-own>{{ rte.docExtraStats.lines }}</strong></div>
              <div data-rte-own class="rte-wordstats-row"><span data-rte-own>标题数</span><strong data-rte-own>{{ rte.docExtraStats.headings }}</strong></div>
              <div data-rte-own class="rte-wordstats-row"><span data-rte-own>汉字</span><strong data-rte-own>{{ rte.docExtraStats.cjk }}</strong></div>
              <div data-rte-own class="rte-wordstats-row"><span data-rte-own>英文词</span><strong data-rte-own>{{ rte.docExtraStats.asciiWords }}</strong></div>
              <div data-rte-own class="rte-wordstats-divider" />
              <div data-rte-own class="rte-wordstats-row">
                <span data-rte-own>选区字符</span>
                <strong data-rte-own>{{ rte.selectionStats.hasSelection ? rte.selectionStats.chars : '—' }}</strong>
              </div>
              <div data-rte-own class="rte-wordstats-row">
                <span data-rte-own>选区词数</span>
                <strong data-rte-own>{{ rte.selectionStats.hasSelection ? rte.selectionStats.words : '—' }}</strong>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'callout'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('callout')"
          @mouseleave="rte.onToolMenuLeave($event, 'callout', () => (rte.calloutOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('callout', el)"
            data-rte-anchor="callout"
            :class="{ active: rte.calloutOpen || rte.isActive('callout') }"
            title="告示框（提示/警告/成功/错误）"
            aria-label="告示框"
            @click.stop="rte.markToolbarMenuOpening(); rte.calloutOpen = !rte.calloutOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('callout')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">告示<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.calloutOpen"
              class="rte-menu rte-callout-menu"
              v-rte-float="'callout'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('callout')"
              @mouseleave="rte.onToolMenuLeave($event, 'callout', () => (rte.calloutOpen = false))"
            >
              <div data-rte-own class="rte-menu-section-label">插入告示框</div>
              <button data-rte-own
                v-for="it in rte.CALLOUT_MENU_ITEMS"
                :key="'co-' + it.variant"
                type="button"
                :class="{ active: rte.isActive('callout', { variant: it.variant }) }"
                @click="rte.insertCallout(it.variant)"
              >
                <span data-rte-own class="rte-callout-dot" :data-variant="it.variant" aria-hidden="true" />
                <span data-rte-own>{{ it.label }}</span>
                <span data-rte-own class="rte-menu-hint">{{ it.hint }}</span>
              </button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own
                type="button"
                :disabled="!rte.isActive('callout')"
                @click="rte.editor?.chain().focus().unsetCallout().run(); rte.calloutOpen = false"
              >
                取消告示框
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'shortcuts'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('shortcuts')"
          @mouseleave="rte.onToolMenuLeave($event, 'shortcuts', () => (rte.shortcutsOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('shortcuts', el)"
            data-rte-anchor="shortcuts"
            :class="{ active: rte.shortcutsOpen }"
            title="快捷键速查"
            aria-label="快捷键速查"
            @click.stop="rte.toggleShortcutsPanel()"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="rte.toolIcon('shortcuts')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">快捷键</span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.shortcutsOpen && rte.expanded"
              class="rte-shortcuts-panel"
              v-rte-float="'shortcuts'"
              role="dialog"
              aria-label="快捷键说明"
              tabindex="-1"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('shortcuts')"
              @mouseleave="rte.onToolMenuLeave($event, 'shortcuts', () => (rte.shortcutsOpen = false))"
            >
              <div data-rte-own class="rte-shortcuts-title">快捷键速查</div>
              <input data-rte-own
                v-model="rte.shortcutQuery"
                class="rte-shortcuts-search"
                type="search"
                placeholder="搜索，例如 bold、引用、tab"
                aria-label="搜索快捷键"
                @mousedown.stop
                @keydown.stop
              />
              <div data-rte-own v-if="!rte.filteredShortcutGroups.length" class="rte-shortcuts-empty">没有匹配的快捷键</div>
              <div data-rte-own
                v-for="g in rte.filteredShortcutGroups"
                :key="'scg-' + g.title"
                class="rte-shortcuts-group"
              >
                <div data-rte-own class="rte-shortcuts-group-title">{{ g.title }}</div>
                <div data-rte-own
                  v-for="(it, i) in g.items"
                  :key="'sci-' + g.title + '-' + i"
                  class="rte-shortcuts-row"
                >
                  <kbd data-rte-own class="rte-kbd">{{ it.keys }}</kbd>
                  <span data-rte-own>{{ it.desc }}</span>
                </div>
              </div>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'hr'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('hr')"
          @mouseleave="rte.onToolMenuLeave($event, 'hr', () => (rte.hrOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('hr', el)"
            data-rte-anchor="hr"
            :class="{ active: rte.hrOpen || rte.isActive('horizontalRule') }"
            title="分割线（也可输入 ---）"
            aria-label="分割线"
            aria-haspopup="menu"
            :aria-expanded="rte.hrOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.hrOpen = !rte.hrOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('hr')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">分割线<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'blockOps'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('blockOps')"
          @mouseleave="rte.onToolMenuLeave($event, 'blockOps', () => (rte.blockOpsOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('blockOps', el)"
            data-rte-anchor="blockOps"
            :class="{ active: rte.blockOpsOpen }"
            title="块操作"
            @click.stop="rte.markToolbarMenuOpening(); rte.blockOpsOpen = !rte.blockOpsOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('more')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">块<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'insertDate'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('insertDate')"
          @mouseleave="rte.onToolMenuLeave($event, 'insertDate', () => (rte.insertDateOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('insertDate', el)"
            data-rte-anchor="insertDate"
            :class="{ active: rte.insertDateOpen }"
            title="插入日期"
            @click.stop="rte.markToolbarMenuOpening(); rte.insertDateOpen = !rte.insertDateOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('note')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">日期<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'echartsGroup'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter(t.key)"
          @mouseleave="rte.onToolMenuLeave($event, t.key, () => (rte.echartsGroupMenuKey = null))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor(t.key, el)"
            :data-rte-anchor="t.key"
            :class="{ active: rte.echartsGroupMenuKey === t.key }"
            :title="t.title || ('插入' + t.label + '图表')"
            aria-haspopup="menu"
            :aria-expanded="rte.echartsGroupMenuKey === t.key"
            @click.stop="rte.markToolbarMenuOpening(); toggleChartGroupMenu(t.key)"
          >
            <span data-rte-own class="rte-tool-icon">
              <component
                v-if="t.iconComp"
                data-rte-own
                :is="t.iconComp"
                class="rte-ep-icon"
              />
              <template v-else>{{ t.icon }}</template>
            </span>
            <span data-rte-own class="rte-tool-label">{{ t.label }}<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.echartsGroupMenuKey === t.key"
              class="rte-menu rte-menu-echarts"
              v-rte-float="t.key"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter(t.key)"
              @mouseleave="rte.onToolMenuLeave($event, t.key, () => (rte.echartsGroupMenuKey = null))"
            >
              <!-- 只列本分类下的具体图表类型 -->
              <div data-rte-own class="rte-menu-section">{{ t.title || t.label }}</div>
              <template v-for="cat in chartCategoriesOf(chartGroupIdOfTool(t.key))" :key="'cat-' + cat.id">
                <button
                  data-rte-own
                  type="button"
                  class="rte-menu-cat"
                  :class="{ 'is-open': rte.echartsOpenCategory === cat.id }"
                  @click="rte.toggleEchartsCategory(cat.id)"
                >
                  <strong data-rte-own>{{ cat.label }}</strong>
                  <span data-rte-own class="rte-menu-hint">{{ cat.templates.length }} 种</span>
                </button>
                <div
                  v-if="rte.echartsOpenCategory === cat.id"
                  data-rte-own
                  class="rte-menu-sub"
                >
                  <button
                    v-for="tpl in cat.templates"
                    :key="'tpl-' + tpl.id"
                    data-rte-own
                    type="button"
                    @click="rte.insertEchartsTemplateById(tpl.id)"
                  >
                    {{ tpl.label }}
                    <span data-rte-own class="rte-menu-hint">{{ tpl.hint }}</span>
                  </button>
                </div>
              </template>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true"></div>
              <button data-rte-own type="button" @click="rte.openEchartsDialog()">一键生成…</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'caseTransform'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('caseTransform')"
          @mouseleave="rte.onToolMenuLeave($event, 'caseTransform', () => (rte.caseMenuOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('caseTransform', el)"
            data-rte-anchor="caseTransform"
            :class="{ active: rte.caseMenuOpen }"
            title="大小写转换"
            @click.stop="rte.markToolbarMenuOpening(); rte.caseMenuOpen = !rte.caseMenuOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('fontSize')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">大小写<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.caseMenuOpen"
              class="rte-menu"
              v-rte-float="'caseTransform'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('caseTransform')"
              @mouseleave="rte.onToolMenuLeave($event, 'caseTransform', () => (rte.caseMenuOpen = false))"
            >
              <button data-rte-own type="button" @click="rte.runCaseTransform('upper')">全大写</button>
              <button data-rte-own type="button" @click="rte.runCaseTransform('lower')">全小写</button>
              <button data-rte-own type="button" @click="rte.runCaseTransform('title')">词首大写</button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'zoom'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('zoom')"
          @mouseleave="rte.onToolMenuLeave($event, 'zoom', () => (rte.zoomMenuOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('zoom', el)"
            data-rte-anchor="zoom"
            :class="{ active: rte.zoomMenuOpen || rte.editorZoom !== 1 }"
            title="编辑区缩放"
            @click.stop="rte.markToolbarMenuOpening(); rte.zoomMenuOpen = !rte.zoomMenuOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('wordStats')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">{{ Math.round(rte.editorZoom * 100) }}%<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.zoomMenuOpen"
              class="rte-menu"
              v-rte-float="'zoom'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('zoom')"
              @mouseleave="rte.onToolMenuLeave($event, 'zoom', () => (rte.zoomMenuOpen = false))"
            >
              <button data-rte-own
                v-for="z in rte.RTE_ZOOM_PRESETS"
                :key="'z-' + z.value"
                type="button"
                :class="{ active: rte.editorZoom === z.value }"
                @click="rte.setEditorZoom(z.value)"
              >
                {{ z.label }}
              </button>
            </div>
          </Teleport>
        </div>
        <div data-rte-own
          v-else-if="t.kind === 'viewExtras'"
          class="rte-tool-wrap"
          @mouseenter="rte.onToolMenuEnter('viewExtras')"
          @mouseleave="rte.onToolMenuLeave($event, 'viewExtras', () => (rte.viewExtrasOpen = false))"
        >
          <button data-rte-own
            type="button"
            class="rte-tool"
            :ref="(el) => rte.setFloatAnchor('viewExtras', el)"
            data-rte-anchor="viewExtras"
            :class="{ active: rte.viewExtrasOpen || rte.focusMode || rte.darkEditor || rte.paperGuide || rte.pageSize !== 'full' }"
            :title="`视图 · ${rte.pageSizeMeta.label}`"
            aria-haspopup="menu"
            :aria-expanded="rte.viewExtrasOpen"
            @click.stop="rte.markToolbarMenuOpening(); rte.viewExtrasOpen = !rte.viewExtrasOpen"
          >
            <span data-rte-own class="rte-tool-icon">
              <component data-rte-own :is="t.iconComp || rte.toolIcon('outline')" class="rte-ep-icon" />
            </span>
            <span data-rte-own class="rte-tool-label">视图<span data-rte-own class="rte-caret" aria-hidden="true"></span></span>
          </button>
          <Teleport to="body">
            <div data-rte-own
              v-if="rte.viewExtrasOpen"
              class="rte-menu"
              v-rte-float="'viewExtras'"
              @mousedown.prevent
              @mouseenter="rte.onToolMenuEnter('viewExtras')"
              @mouseleave="rte.onToolMenuLeave($event, 'viewExtras', () => (rte.viewExtrasOpen = false))"
            >
              <button data-rte-own type="button" :class="{ active: rte.focusMode }" @click="rte.toggleFocusMode">专注模式</button>
              <button data-rte-own type="button" :class="{ active: rte.darkEditor }" @click="rte.toggleDarkEditor">暗色编辑区</button>
              <button data-rte-own type="button" :class="{ active: rte.paperGuide }" @click="rte.togglePaperGuide">纸张参考线</button>
              <template data-rte-own v-if="rte.pageSheetEnabled">
                <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
                <div data-rte-own class="rte-page-size-label">页面大小</div>
                <button data-rte-own
                  v-for="opt in rte.RTE_PAGE_SIZES"
                  :key="'ps-' + opt.id"
                  type="button"
                  role="menuitemradio"
                  :aria-checked="rte.pageSize === opt.id"
                  :class="{ active: rte.pageSize === opt.id }"
                  :title="opt.hint"
                  @click="rte.setPageSize(opt.id)"
                >
                  {{ opt.label }}
                  <span data-rte-own class="rte-menu-hint">{{ opt.hint }}</span>
                </button>
              </template>
            </div>
          </Teleport>
        </div>
        <button data-rte-own
          v-else
          type="button"
          class="rte-tool"
          :class="{ active: t.active?.(), 'is-disabled': t.disabled?.() }"
          :title="t.title || t.label"
          :aria-label="t.title || t.label"
          :aria-pressed="t.active ? !!t.active() : undefined"
          :disabled="t.disabled?.() || undefined"
          @click="t.run?.()"
          @dblclick.stop="t.key === 'formatPainter' && rte.onFormatPainterDblClick()"
        >
          <span data-rte-own class="rte-tool-icon">
            <component data-rte-own
              v-if="t.iconComp"
              :is="t.iconComp"
              class="rte-ep-icon"
            />
            <template v-else>{{ t.icon }}</template>
          </span>
          <span data-rte-own class="rte-tool-label">{{ t.label }}</span>
        </button>
      </template>
      </div>

      <!-- 未最大化：其余工具收进「更多」 -->
      <div data-rte-own
        v-if="!rte.expanded && rte.moreTools.length"
        class="rte-tool-wrap rte-more-wrap"
        @mouseenter="rte.onToolMenuEnter('more')"
        @mouseleave="rte.onToolMenuLeave($event, 'more', rte.closeMore)"
      >
        <button data-rte-own
          type="button"
          class="rte-tool is-labeled"
          :ref="(el) => rte.setFloatAnchor('more', el)" data-rte-anchor="more"
          :class="{ active: rte.moreOpen }"
          title="更多格式与插入"
          aria-label="更多格式与插入"
          aria-haspopup="menu"
          :aria-expanded="rte.moreOpen"
          @click.stop="rte.markToolbarMenuOpening(); rte.moreOpen = !rte.moreOpen"
        >
          <span data-rte-own class="rte-tool-icon">
            <component data-rte-own :is="rte.toolIcon('more')" class="rte-ep-icon" />
          </span>
          <span data-rte-own class="rte-tool-label">更多</span>
        </button>
        <Teleport to="body">
          <div data-rte-own
            v-if="rte.moreOpen"
            class="rte-more-menu"
            v-rte-float="'more'"
            :class="{ 'has-flyout': rte.moreColorOpen || rte.moreHighlightOpen || rte.moreFormOpen || rte.moreTemplateOpen || rte.moreFontSizeOpen || rte.moreFontFamilyOpen || rte.moreLineHeightOpen || rte.moreCalloutOpen }"
            @mousedown.prevent
            @mouseenter="rte.onToolMenuEnter('more')"
            @mouseleave="rte.onToolMenuLeave($event, 'more', rte.closeMore)"
          >
          <div data-rte-own
            v-for="group in rte.moreGroups"
            :key="group.id"
            class="rte-more-group"
            :data-group-id="group.id"
            :class="{
              'is-dragging': rte.toolbarDragSource === group.id,
              'is-drop-target': rte.toolbarDropIndex === rte.toolbarOrder.indexOf(group.id),
            }"
          >
            <button data-rte-own
              v-if="rte.viewMode === 'edit'"
              type="button"
              class="rte-more-capsule"
              draggable="false"
              :aria-label="'拖动' + group.label + '分组'"
              title="拖动整组"
              @pointerdown="rte.onToolbarHandlePointerDown(group.id, $event)"
              @pointermove="rte.onToolbarHandlePointerMove"
              @pointerup="rte.onToolbarHandlePointerUp"
              @pointercancel="rte.onToolbarHandlePointerUp"
              @keydown="rte.onToolbarGroupKeydown(group.id, $event)"
            >
              ⠿ {{ group.label }}
            </button>
            <template v-for="mt in group.tools" :key="mt.key">
            <button data-rte-own
              type="button"
              class="rte-more-item"
              @mouseenter="rte.hoverMoreSubmenu(mt)"
              :class="{
                active:
                  mt.active?.() ||
                  (mt.kind === 'color' && rte.moreColorOpen) ||
                  (mt.key === 'highlight' && rte.moreHighlightOpen) ||
                  (mt.kind === 'form' && rte.moreFormOpen) ||
                  (mt.kind === 'callout' && rte.moreCalloutOpen) ||
                  (mt.kind === 'template' && rte.moreTemplateOpen) ||
                  (mt.kind === 'fontSize' && rte.moreFontSizeOpen) ||
                  (mt.kind === 'fontFamily' && rte.moreFontFamilyOpen) ||
                  (mt.kind === 'lineHeight' && rte.moreLineHeightOpen),
              }"
              @click="rte.onMoreToolClick(mt)"
            >
              <span data-rte-own class="rte-more-icon">
                <component data-rte-own
                  v-if="mt.iconComp"
                  :is="mt.iconComp"
                  class="rte-ep-icon"
                />
                <template v-else>{{ mt.icon }}</template>
              </span>
              <span data-rte-own>{{ mt.title || mt.label }}</span>
              <span data-rte-own
                v-if="mt.kind === 'color' || mt.key === 'highlight' || mt.kind === 'attach' || mt.kind === 'form' || mt.kind === 'template' || mt.kind === 'fontSize' || mt.kind === 'fontFamily' || mt.kind === 'lineHeight' || mt.kind === 'callout' || mt.kind === 'caseTransform' || mt.kind === 'zoom' || mt.kind === 'viewExtras' || mt.kind === 'echartsGroup'"
                class="rte-more-caret"
              >{{ mt.kind === 'attach' || mt.kind === 'form' || mt.kind === 'template' ? '▾' : '▸' }}</span>
            </button>
            <div data-rte-own
              v-if="mt.kind === 'echartsGroup' && rte.moreChartGroupKey === mt.key"
              class="rte-menu rte-chart-more-flyout"
              @mousedown.prevent
            >
              <!-- 紧凑态「更多」里的一级分类下拉：窄屏也能找到 9 个图表分类 -->
              <div data-rte-own class="rte-menu-section">{{ mt.title || mt.label }}</div>
              <template v-for="cat in chartCategoriesOf(chartGroupIdOfTool(mt.key))" :key="'mcat-' + cat.id">
                <button data-rte-own
                  type="button"
                  class="rte-menu-cat"
                  :class="{ 'is-open': rte.echartsOpenCategory === cat.id }"
                  @click="rte.toggleEchartsCategory(cat.id)"
                >
                  <strong data-rte-own>{{ cat.label }}</strong>
                  <span data-rte-own class="rte-menu-hint">{{ cat.templates.length }} 种</span>
                </button>
                <div data-rte-own
                  v-if="rte.echartsOpenCategory === cat.id"
                  class="rte-menu-sub"
                >
                  <button data-rte-own
                    v-for="tpl in cat.templates"
                    :key="'mtpl-' + tpl.id"
                    type="button"
                    @click="rte.insertEchartsTemplateById(tpl.id)"
                  >
                    {{ tpl.label }}
                    <span data-rte-own class="rte-menu-hint">{{ tpl.hint }}</span>
                  </button>
                </div>
              </template>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true"></div>
              <button data-rte-own type="button" @click="rte.openEchartsDialog()">一键生成…</button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'fontSize' && rte.moreFontSizeOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.FONT_SIZE_OPTIONS"
                :key="'mfs-' + opt.label"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentFontSize() || '') }"
                @click="rte.applyFontSize(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'fontFamily' && rte.moreFontFamilyOpen"
              class="rte-menu rte-more-flyout rte-font-family-menu"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.FONT_FAMILY_OPTIONS"
                :key="'mff-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentFontFamily() || '') }"
                :style="opt.value ? { fontFamily: opt.value } : undefined"
                @click="rte.applyFontFamily(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'lineHeight' && rte.moreLineHeightOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="opt in rte.LINE_HEIGHT_OPTIONS"
                :key="'mlh-' + (opt.value || 'default')"
                type="button"
                :class="{ active: (opt.value || '') === (rte.currentLineHeight() || '') }"
                @click="rte.applyLineHeight(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'caseTransform' && rte.caseMenuOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own type="button" @click="rte.runCaseTransform('upper')">全大写</button>
              <button data-rte-own type="button" @click="rte.runCaseTransform('lower')">全小写</button>
              <button data-rte-own type="button" @click="rte.runCaseTransform('title')">词首大写</button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'zoom' && rte.zoomMenuOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own
                v-for="z in rte.RTE_ZOOM_PRESETS"
                :key="'mz-' + z.value"
                type="button"
                :class="{ active: rte.editorZoom === z.value }"
                @click="rte.setEditorZoom(z.value)"
              >
                {{ z.label }}
              </button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'viewExtras' && rte.viewExtrasOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own type="button" :class="{ active: rte.focusMode }" @click="rte.toggleFocusMode">专注模式</button>
              <button data-rte-own type="button" :class="{ active: rte.darkEditor }" @click="rte.toggleDarkEditor">暗色编辑区</button>
              <button data-rte-own type="button" :class="{ active: rte.paperGuide }" @click="rte.togglePaperGuide">纸张参考线</button>
              <template data-rte-own v-if="rte.pageSheetEnabled">
                <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
                <div data-rte-own class="rte-page-size-label">页面大小</div>
                <button data-rte-own
                  v-for="opt in rte.RTE_PAGE_SIZES"
                  :key="'mps-' + opt.id"
                  type="button"
                  role="menuitemradio"
                  :aria-checked="rte.pageSize === opt.id"
                  :class="{ active: rte.pageSize === opt.id }"
                  :title="opt.hint"
                  @click="rte.setPageSize(opt.id)"
                >
                  {{ opt.label }}
                  <span data-rte-own class="rte-menu-hint">{{ opt.hint }}</span>
                </button>
              </template>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'form' && rte.moreFormOpen"
              class="rte-menu rte-more-flyout"
              @mousedown.prevent
            >
              <button data-rte-own type="button" @click="rte.insertFormRadio()">单选组</button>
              <button data-rte-own type="button" @click="rte.insertFormCheckbox()">多选组</button>
              <button data-rte-own type="button" @click="rte.insertFormText()">文本输入</button>
              <button data-rte-own type="button" @click="rte.insertFormTextarea()">多行文本</button>
              <button data-rte-own type="button" @click="rte.insertFormNumber()">数字输入</button>
              <button data-rte-own type="button" @click="rte.insertFormSelect()">下拉选择</button>
              <button data-rte-own type="button" @click="rte.insertFormDate()">日期</button>
              <button data-rte-own type="button" @click="rte.insertFormDateTime()">日期时间</button>
              <button data-rte-own type="button" @click="rte.insertFormSwitch()">开关</button>
              <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
              <button data-rte-own
                type="button"
                @click="rte.moreFormOpen = false; rte.moreOpen = false; rte.openTableDialog()"
              >
                表格
              </button>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'template' && rte.moreTemplateOpen"
              class="rte-menu rte-more-flyout rte-template-menu"
              @mousedown.prevent
            >
              <div data-rte-own class="rte-template-menu-body">
              <template v-for="g in rte.RTE_DOC_TEMPLATE_GROUPS" :key="'m-' + g.id">
                <div data-rte-own class="rte-menu-section-label">{{ g.label }}</div>
                <div data-rte-own class="rte-template-grid">
                  <button data-rte-own
                    v-for="tpl in rte.RTE_DOC_TEMPLATES.filter((x: any) => x.group === g.id)"
                    :key="tpl.id"
                    type="button"
                    class="rte-template-item"
                    :title="tpl.description || tpl.label"
                    @click.stop="rte.insertDocTemplate(tpl.id)"
                  >
                    <span data-rte-own class="rte-template-item-label">{{ tpl.label }}</span>
                    <span data-rte-own v-if="tpl.description" class="rte-template-item-desc">{{
                      tpl.description
                    }}</span>
                  </button>
                </div>
              </template>
              </div>
            </div>
            <div data-rte-own
              v-if="mt.kind === 'color' && rte.moreColorOpen"
              class="rte-menu rte-color-menu rte-more-flyout"
              @mousedown.prevent
            >
              <RteColorBoard data-rte-own kind="text" />
            </div>
            <div data-rte-own
              v-if="mt.kind === 'callout' && rte.moreCalloutOpen"
              class="rte-menu rte-callout-menu rte-more-flyout"
              @mousedown.prevent
            >
              <div data-rte-own class="rte-menu-section-label">插入告示框</div>
              <button data-rte-own
                v-for="it in rte.CALLOUT_MENU_ITEMS"
                :key="'mco-' + it.variant"
                type="button"
                :class="{ active: rte.isActive('callout', { variant: it.variant }) }"
                @click="rte.insertCallout(it.variant)"
              >
                <span data-rte-own class="rte-callout-dot" :data-variant="it.variant" aria-hidden="true" />
                <span data-rte-own>{{ it.label }}</span>
                <span data-rte-own class="rte-menu-hint">{{ it.hint }}</span>
              </button>
            </div>
            <div data-rte-own
              v-if="mt.key === 'highlight' && rte.moreHighlightOpen"
              class="rte-menu rte-color-menu rte-highlight-menu rte-more-flyout"
              role="dialog"
              aria-label="高亮颜色"
              @mousedown.prevent
            >
              <RteColorBoard data-rte-own kind="highlight" />
            </div>
            </template>
          </div>
          </div>
        </Teleport>
      </div>

      <!-- 紧凑「更多」打开的浮层面板（顶栏无对应按钮时，锚到「更多」） -->
      <Teleport to="body">
        <div data-rte-own
          v-if="!rte.expanded && rte.emojiOpen"
          class="rte-emoji-panel"
          v-rte-float="'emoji'"
          @mousedown.prevent
          @mouseenter="rte.onToolMenuEnter('emoji')"
          @mouseleave="rte.onToolMenuLeave($event, 'emoji', () => (rte.emojiOpen = false))"
        >
          <div data-rte-own class="rte-picker-tabs" role="tablist" aria-label="表情分类">
            <button data-rte-own
              v-for="cat in rte.RTE_EMOJI_CATEGORIES"
              :key="'c-em-tab-' + cat.id"
              type="button"
              role="tab"
              class="rte-picker-tab"
              :class="{ active: rte.emojiTabId === cat.id }"
              :aria-selected="rte.emojiTabId === cat.id"
              @click.stop="rte.emojiTabId = cat.id"
            >{{ cat.label }}</button>
          </div>
          <div data-rte-own
            class="rte-picker-grid rte-emoji-grid"
            :class="{ 'rte-emoji-grid--large': rte.isLargeEmojiTab, 'rte-emoji-grid--kaomoji': rte.isKaomojiTab }"
            role="tabpanel"
          >
            <button data-rte-own
              v-for="em in rte.activeEmojiList"
              :key="'c-em-' + rte.emojiTabId + '-' + em"
              type="button"
              class="rte-emoji-btn"
              :class="{ 'rte-emoji-btn--kaomoji': rte.isKaomojiTab || em.includes('(') || em.includes('¯') || em.includes('∠') }"
              :title="em"
              @click="rte.insertEmoji(em)"
            >{{ em }}</button>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div data-rte-own
          v-if="!rte.expanded && rte.specialCharsOpen"
          class="rte-specialchars-panel"
          v-rte-float="'specialChars'"
          @mousedown.prevent
          @mouseenter="rte.onToolMenuEnter('specialChars')"
          @mouseleave="rte.onToolMenuLeave($event, 'specialChars', () => (rte.specialCharsOpen = false))"
        >
          <div data-rte-own class="rte-picker-tabs" role="tablist" aria-label="字符分类">
            <button data-rte-own
              v-for="cat in rte.RTE_SPECIAL_CHAR_CATEGORIES"
              :key="'c-sc-tab-' + cat.id"
              type="button"
              role="tab"
              class="rte-picker-tab"
              :class="{ active: rte.specialCharTabId === cat.id }"
              :aria-selected="rte.specialCharTabId === cat.id"
              @click.stop="rte.specialCharTabId = cat.id"
            >{{ cat.label }}</button>
          </div>
          <div data-rte-own class="rte-picker-grid rte-specialchars-grid" role="tabpanel">
            <button data-rte-own
              v-for="ch in rte.activeSpecialCharList"
              :key="'c-sc-' + rte.specialCharTabId + '-' + ch"
              type="button"
              class="rte-specialchars-btn"
              :title="ch"
              @click="rte.insertSpecialChar(ch)"
            >{{ ch }}</button>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div data-rte-own
          v-if="!rte.expanded && rte.spacingOpen"
          class="rte-spacing-panel"
          v-rte-float="'spacing'"
          @mousedown.prevent
          @mouseenter="rte.onToolMenuEnter('spacing')"
          @mouseleave="rte.onToolMenuLeave($event, 'spacing', () => (rte.spacingOpen = false))"
        >
          <div data-rte-own class="rte-spacing-row">
            <span data-rte-own class="rte-spacing-label">段前</span>
            <select data-rte-own
              class="rte-spacing-select"
              :value="rte.currentMarginTop()"
              @change="rte.applyMarginTop(($event.target as HTMLSelectElement).value)"
            >
              <option data-rte-own value="">默认</option>
              <option data-rte-own value="0">0</option>
              <option data-rte-own value="0.5em">0.5em</option>
              <option data-rte-own value="1em">1em</option>
              <option data-rte-own value="1.5em">1.5em</option>
              <option data-rte-own value="2em">2em</option>
              <option data-rte-own value="3em">3em</option>
            </select>
          </div>
          <div data-rte-own class="rte-spacing-row">
            <span data-rte-own class="rte-spacing-label">段后</span>
            <select data-rte-own
              class="rte-spacing-select"
              :value="rte.currentMarginBottom()"
              @change="rte.applyMarginBottom(($event.target as HTMLSelectElement).value)"
            >
              <option data-rte-own value="">默认</option>
              <option data-rte-own value="0">0</option>
              <option data-rte-own value="0.5em">0.5em</option>
              <option data-rte-own value="1em">1em</option>
              <option data-rte-own value="1.5em">1.5em</option>
              <option data-rte-own value="2em">2em</option>
              <option data-rte-own value="3em">3em</option>
            </select>
          </div>
          <div data-rte-own class="rte-spacing-row">
            <span data-rte-own class="rte-spacing-label">字间距</span>
            <select data-rte-own
              class="rte-spacing-select"
              :value="rte.currentLetterSpacing()"
              @change="rte.applyLetterSpacing(($event.target as HTMLSelectElement).value)"
            >
              <option data-rte-own value="">默认</option>
              <option data-rte-own value="0">0</option>
              <option data-rte-own value="0.05em">0.05em</option>
              <option data-rte-own value="0.1em">0.1em</option>
              <option data-rte-own value="0.15em">0.15em</option>
              <option data-rte-own value="0.2em">0.2em</option>
              <option data-rte-own value="0.3em">0.3em</option>
            </select>
          </div>
          <div data-rte-own class="rte-spacing-row">
            <span data-rte-own class="rte-spacing-label">首行缩进</span>
            <select data-rte-own
              class="rte-spacing-select"
              :value="rte.currentTextIndent()"
              @change="rte.applyTextIndent(($event.target as HTMLSelectElement).value)"
            >
              <option data-rte-own value="">无</option>
              <option data-rte-own value="2em">2 字符</option>
              <option data-rte-own value="3em">3 字符</option>
              <option data-rte-own value="4em">4 字符</option>
            </select>
          </div>
          <div data-rte-own class="rte-spacing-row">
            <span data-rte-own class="rte-spacing-label">文字方向</span>
            <select data-rte-own
              class="rte-spacing-select"
              :value="rte.currentTextDir()"
              @change="rte.applyTextDir(($event.target as HTMLSelectElement).value as '' | 'ltr' | 'rtl')"
            >
              <option data-rte-own value="">默认</option>
              <option data-rte-own value="ltr">从左到右</option>
              <option data-rte-own value="rtl">从右到左</option>
            </select>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div data-rte-own
          v-if="!rte.expanded && rte.wordStatsOpen"
          class="rte-wordstats-panel"
          v-rte-float="'wordStats'"
          @mousedown.prevent
          @mouseenter="rte.onToolMenuEnter('wordStats')"
          @mouseleave="rte.onToolMenuLeave($event, 'wordStats', () => (rte.wordStatsOpen = false))"
        >
          <div data-rte-own class="rte-wordstats-title">字数统计</div>
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>全文（去空白）</span><strong data-rte-own>{{ rte.charCount }}</strong></div>
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>词数（估）</span><strong data-rte-own>{{ rte.wordCount }}</strong></div>
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>阅读约</span><strong data-rte-own>{{ rte.readingMinutes }} 分钟</strong></div>
          <div data-rte-own class="rte-wordstats-divider" />
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>段落</span><strong data-rte-own>{{ rte.docExtraStats.paragraphs }}</strong></div>
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>行数</span><strong data-rte-own>{{ rte.docExtraStats.lines }}</strong></div>
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>标题数</span><strong data-rte-own>{{ rte.docExtraStats.headings }}</strong></div>
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>汉字</span><strong data-rte-own>{{ rte.docExtraStats.cjk }}</strong></div>
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>英文词</span><strong data-rte-own>{{ rte.docExtraStats.asciiWords }}</strong></div>
          <div data-rte-own class="rte-wordstats-divider" />
          <div data-rte-own class="rte-wordstats-row">
            <span data-rte-own>选区字符</span>
            <strong data-rte-own>{{ rte.selectionStats.hasSelection ? rte.selectionStats.chars : '—' }}</strong>
          </div>
          <div data-rte-own class="rte-wordstats-row">
            <span data-rte-own>选区词数</span>
            <strong data-rte-own>{{ rte.selectionStats.hasSelection ? rte.selectionStats.words : '—' }}</strong>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div data-rte-own
          v-if="!rte.expanded && rte.shortcutsOpen"
          class="rte-shortcuts-panel"
          v-rte-float="'shortcuts'"
          role="dialog"
          aria-label="快捷键说明"
          tabindex="-1"
          @mousedown.prevent
          @mouseenter="rte.onToolMenuEnter('shortcuts')"
          @mouseleave="rte.onToolMenuLeave($event, 'shortcuts', () => (rte.shortcutsOpen = false))"
        >
          <div data-rte-own class="rte-shortcuts-title">快捷键速查</div>
          <input data-rte-own
            v-model="rte.shortcutQuery"
            class="rte-shortcuts-search"
            type="search"
            placeholder="搜索，例如 bold、引用、tab"
            aria-label="搜索快捷键"
            @mousedown.stop
            @keydown.stop
          />
          <div data-rte-own v-if="!rte.filteredShortcutGroups.length" class="rte-shortcuts-empty">没有匹配的快捷键</div>
          <div data-rte-own
            v-for="g in rte.filteredShortcutGroups"
            :key="'c-scg-' + g.title"
            class="rte-shortcuts-group"
          >
            <div data-rte-own class="rte-shortcuts-group-title">{{ g.title }}</div>
            <div data-rte-own
              v-for="(it, i) in g.items"
              :key="'c-sci-' + g.title + '-' + i"
              class="rte-shortcuts-row"
            >
              <kbd data-rte-own class="rte-kbd">{{ it.keys }}</kbd>
              <span data-rte-own>{{ it.desc }}</span>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- 分组内的按钮显隐与顺序（右键分组打开） -->
      <Teleport to="body">
        <div data-rte-own
          v-if="rte.toolbarGroupButtonsOpen"
          class="rte-menu rte-float-menu rte-group-buttons-menu"
          v-rte-float="'toolbarGroupButtons'"
          role="menu"
          aria-label="组内按钮"
          @mousedown.prevent
        >
          <div data-rte-own class="rte-menu-section-label">组内按钮 · 勾选显示，箭头调顺序</div>
          <div data-rte-own
            v-for="entry in rte.toolbarGroupButtonEntries(rte.toolbarGroupButtonsGroupId)"
            :key="'gb-' + entry.key"
            class="rte-group-button-row"
          >
            <label data-rte-own class="rte-group-button-check">
              <input
                data-rte-own
                type="checkbox"
                :checked="!entry.hidden"
                :aria-label="'显示' + entry.label"
                @change="rte.toggleToolbarGroupButton(rte.toolbarGroupButtonsGroupId, entry.key)"
              />
              <span data-rte-own>{{ entry.label }}</span>
            </label>
            <button
              data-rte-own
              type="button"
              class="rte-group-button-move"
              :aria-label="'上移' + entry.label"
              title="上移"
              @click="rte.moveToolbarGroupButton(rte.toolbarGroupButtonsGroupId, entry.key, -1)"
            >
              ↑
            </button>
            <button
              data-rte-own
              type="button"
              class="rte-group-button-move"
              :aria-label="'下移' + entry.label"
              title="下移"
              @click="rte.moveToolbarGroupButton(rte.toolbarGroupButtonsGroupId, entry.key, 1)"
            >
              ↓
            </button>
          </div>
          <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
          <button data-rte-own type="button" @click="rte.closeToolbarGroupButtons()">完成</button>
        </div>
      </Teleport>

      </div>
    </div>
</template>
