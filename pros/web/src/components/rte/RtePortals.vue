<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { RTE_BINDINGS } from './bindings'
import { TABLE_MENU_ICONS } from './tableMenuIcons'
import { TABLE_MENU_GROUPS, placeMenuFlyout } from './tableMenuGroups'
import { useParentScopeStamp } from './inheritScope'
import RteAvPickDialog from './RteAvPickDialog.vue'

const rte = inject(RTE_BINDINGS)
if (!rte) throw new Error('RtePortals 必须放在 RichTextEditor 里')
useParentScopeStamp()

const tableCtxGroup = ref('')
const tableCtxFlyout = ref({ top: 0, left: 0 })
watch(() => rte.tableCtx.open, (open: boolean) => {
  if (!open) tableCtxGroup.value = ''
})

function openTableCtxGroup(id: string, event: MouseEvent) {
  tableCtxGroup.value = id
  const el = event.currentTarget as HTMLElement | null
  if (!el) return
  tableCtxFlyout.value = placeMenuFlyout(el)
}

function tableCtxOps(keys: readonly string[]) {
  const items = rte.tableOpItems as Array<{
    key: string
    label: string
    run: () => void
    insertCount?: boolean
    danger?: boolean
    disabled?: () => boolean
    active?: () => boolean
  }>
  return keys
    .map((key) => items.find((op) => op.key === key))
    .filter((op): op is NonNullable<typeof op> => !!op)
}

/** 当前选中的类别下的子类型模板（与工具栏下拉共用同一份目录）。 */
const echartsDialogTemplates = computed(() => {
  const list = rte.ECHARTS_CATEGORIES as Array<{
    id: string
    templates: Array<{ id: string; label: string; hint: string }>
  }>
  const current = rte.echartsDialogType as string
  return list.find((item) => item.id === current)?.templates || []
})
</script>

<template>
    <!-- 插入注释弹层（对照设计稿） -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.noteDialogOpen"
        class="rte-note-overlay"
        @mousedown.self="rte.closeNoteDialog"
      >
        <div data-rte-own
          class="rte-note-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入注释"
          @mousedown.stop
        >
          <h3 data-rte-own class="rte-note-title">插入注释</h3>

          <div data-rte-own class="rte-note-row">
            <div data-rte-own class="rte-note-type-wrap">
              <button data-rte-own
                type="button"
                class="rte-note-type"
                title="选择注释类型：新注释、重要或待办"
                @click.stop="rte.noteTypeOpen = !rte.noteTypeOpen"
              >
                <span data-rte-own class="rte-note-type-icon">[{{ rte.noteTypeMeta.icon }}]</span>
                <span data-rte-own class="rte-note-type-label">{{ rte.noteTypeMeta.label }}</span>
                <span data-rte-own class="rte-note-chevrons" aria-hidden="true">
                  <span data-rte-own>▴</span><span data-rte-own>▾</span>
                </span>
              </button>
              <div data-rte-own v-if="rte.noteTypeOpen" class="rte-note-type-menu" @mousedown.prevent>
                <button data-rte-own
                  v-for="t in rte.NOTE_TYPES"
                  :key="t.value"
                  type="button"
                  :class="{ active: rte.noteType === t.value }"
                  :title="t.title"
                  @click="rte.selectNoteType(t.value)"
                >
                  <span data-rte-own class="rte-note-type-icon">[{{ t.icon }}]</span>
                  <span data-rte-own>{{ t.label }}</span>
                </button>
              </div>
            </div>
            <div data-rte-own class="rte-note-field rte-note-text-field">
              <span data-rte-own class="rte-note-field-icon" aria-hidden="true">T</span>
              <input data-rte-own
                v-model="rte.noteText"
                type="text"
                class="rte-note-input"
                placeholder="输入注释文本"
                title="注释正文，最多 500 字。没选中文字时会把这段插进去"
                maxlength="500"
                @keydown.enter.prevent="rte.confirmInsertNote"
              />
            </div>
          </div>

          <div data-rte-own class="rte-note-field rte-note-link-field">
            <span data-rte-own class="rte-note-field-icon rte-note-link-icon" aria-hidden="true">🔗</span>
            <input data-rte-own
              v-model="rte.noteHref"
              type="url"
              class="rte-note-input"
              placeholder="输入链接地址"
              title="可选。填了以后，点这条注释会打开链接"
              maxlength="2000"
              @keydown.enter.prevent="rte.confirmInsertNote"
            />
          </div>

          <div data-rte-own class="rte-note-actions">
            <button data-rte-own type="button" class="rte-note-cancel" title="不插入注释" @click="rte.closeNoteDialog">
              取消
            </button>
            <button data-rte-own type="button" class="rte-note-insert" title="把注释套到选中的文字上" @click="rte.confirmInsertNote">
              插入
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Slash「/」命令菜单 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.slashOpen"
        :ref="(el) => (rte.slashMenuEl = el)"
        class="rte-slash-menu rte-float-menu"
        data-rte-float-key="slash"
        :style="rte.slashMenuStyle"
        @mousedown.prevent
      >
        <div data-rte-own class="rte-slash-head">
          <span data-rte-own class="rte-slash-title">插入</span>
          <span data-rte-own class="rte-slash-hint">/ 命令{{ rte.slashQuery ? ` · ${rte.slashQuery}` : '' }}</span>
        </div>
        <div data-rte-own v-if="!rte.slashItems.length" class="rte-slash-empty">没有匹配。可试 heading、quote、toggle、表格</div>
        <div data-rte-own v-else class="rte-slash-list" role="listbox" aria-label="斜杠命令">
          <template v-for="(it, idx) in rte.slashItems" :key="it.id">
            <div data-rte-own
              v-if="idx === 0 || rte.rteSlashSectionLabel(it) !== rte.rteSlashSectionLabel(rte.slashItems[(idx as number) - 1])"
              class="rte-slash-section"
            >
              {{ rte.rteSlashSectionLabel(it) }}
            </div>
            <button data-rte-own
              type="button"
              class="rte-slash-item"
              role="option"
              :aria-selected="idx === rte.slashIndex"
              :class="{ 'is-active': idx === rte.slashIndex }"
              :title="(it.description || '插入「' + it.label + '」') + '。Enter 插入'"
              @mouseenter="rte.slashIndex = idx"
              @click="rte.pickSlashItem(it)"
            >
              <span data-rte-own class="rte-slash-glyph" aria-hidden="true">{{ rte.rteSlashGlyph(it) }}</span>
              <span data-rte-own class="rte-slash-item-main">
                <span data-rte-own class="rte-slash-item-label">{{ it.label }}</span>
                <span data-rte-own v-if="it.description" class="rte-slash-item-desc">{{ it.description }}</span>
              </span>
            </button>
          </template>
        </div>
        <div data-rte-own class="rte-slash-foot">↑↓ 选择 · Enter 插入 · Esc 关闭</div>
      </div>
    </Teleport>

    <!-- @提及建议菜单 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.mentionOpen"
        :ref="(el) => (rte.mentionMenuEl = el)"
        class="rte-mention-menu rte-float-menu"
        data-rte-float-key="mention"
        :style="rte.mentionMenuStyle"
        @mousedown.prevent
      >
        <div data-rte-own class="rte-mention-head">
          <span data-rte-own class="rte-mention-title">提及</span>
          <span data-rte-own class="rte-mention-hint">@ 人员或本文块{{ rte.mentionQuery ? ` · ${rte.mentionQuery}` : '' }}</span>
        </div>
        <div data-rte-own v-if="!rte.mentionItems.length" class="rte-mention-empty" :class="{ 'is-error': !!rte.directoryError }">{{ rte.directoryError || rte.mentionEmptyHint(rte.mentionQuery) }}</div>
        <div data-rte-own v-else class="rte-mention-list">
          <template v-for="(it, idx) in rte.mentionItems" :key="it.id">
          <div data-rte-own
            v-if="idx === 0 || rte.mentionSectionLabel(it) !== rte.mentionSectionLabel(rte.mentionItems[(idx as number) - 1]!)"
            class="rte-mention-section"
          >
            {{ rte.mentionSectionLabel(it) }}
          </div>
          <button data-rte-own
            type="button"
            class="rte-mention-item"
            :class="{ 'is-active': idx === rte.mentionIndex }"
            :title="it.kind === 'block' ? '插入指向「' + it.label + '」的引用' : '在这里提及「' + it.label + '」'"
            @mouseenter="rte.mentionIndex = idx"
            @click="rte.pickMentionItem(it)"
          >
            <span data-rte-own class="rte-mention-item-avatar" aria-hidden="true">{{ it.kind === 'block' ? '§' : '@' }}</span>
            <span data-rte-own class="rte-mention-item-main">
              <span data-rte-own class="rte-mention-item-label">{{ it.label }}</span>
              <span data-rte-own v-if="it.role" class="rte-mention-item-role">{{ it.role }}</span>
            </span>
          </button>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- 页面设置：页面大小 / 页边距 / 页眉 / 页脚 / 页码 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.pageSetupOpen && rte.pageSheetEnabled"
        class="rte-modal-overlay"
        @mousedown.self="rte.onPageSetupMask()"
      >
        <div data-rte-own class="rte-modal rte-pagesetup-modal" role="dialog" aria-modal="true" aria-label="页面设置" @mousedown.stop>
          <h3 data-rte-own class="rte-modal-title">页面设置</h3>
          <label data-rte-own class="rte-pagesetup-field">
            <span data-rte-own>页面大小</span>
            <select
              data-rte-own
              class="rte-note-input"
              title="纸张大小，预览和打印按这个排"
              :value="rte.pageSetupDraft?.size"
              :disabled="rte.viewMode !== 'edit'"
              @change="rte.pageSetupDraft && (rte.pageSetupDraft.size = ($event.target as HTMLSelectElement).value)"
            >
              <option data-rte-own v-for="opt in rte.RTE_PAGE_SIZES" :key="'ps-setup-' + opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label data-rte-own class="rte-pagesetup-field">
            <span data-rte-own>页边距</span>
            <select
              data-rte-own
              class="rte-note-input"
              title="页边距预设：常规、窄、适中、宽或无边距"
              :value="rte.pageSetupDraft?.marginPreset"
              :disabled="rte.viewMode !== 'edit'"
              @change="rte.pageSetupDraft && (rte.pageSetupDraft.marginPreset = ($event.target as HTMLSelectElement).value)"
            >
              <option data-rte-own v-for="opt in rte.PAGE_MARGIN_PRESETS" :key="'mg-setup-' + opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
              <option data-rte-own value="custom">自定义</option>
            </select>
          </label>
          <label data-rte-own class="rte-pagesetup-field">
            <span data-rte-own>页眉</span>
            <input
              data-rte-own
              class="rte-note-input"
              type="text"
              maxlength="80"
              title="印在每页顶部，最多 80 字"
              placeholder="每页顶部的内容"
              :value="rte.pageSetupDraft?.header"
              :disabled="rte.viewMode !== 'edit'"
              @input="rte.pageSetupDraft && (rte.pageSetupDraft.header = ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label data-rte-own class="rte-pagesetup-field">
            <span data-rte-own>页脚</span>
            <input
              data-rte-own
              class="rte-note-input"
              type="text"
              maxlength="80"
              title="印在每页底部，最多 80 字"
              placeholder="每页底部的内容"
              :value="rte.pageSetupDraft?.footer"
              :disabled="rte.viewMode !== 'edit'"
              @input="rte.pageSetupDraft && (rte.pageSetupDraft.footer = ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label data-rte-own class="rte-pagesetup-field">
            <span data-rte-own>页码</span>
            <select
              data-rte-own
              class="rte-note-input"
              title="页码样式：1、第 1 页、第 1 页共 n 页，或 - 1 -"
              :value="rte.pageSetupDraft?.pageNumber"
              :disabled="rte.viewMode !== 'edit'"
              @change="rte.pageSetupDraft && (rte.pageSetupDraft.pageNumber = ($event.target as HTMLSelectElement).value)"
            >
              <option data-rte-own v-for="opt in rte.PAGE_NUMBER_OPTIONS" :key="'pn-setup-' + opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="不保存这次页面设置" @click="rte.closePageSetup()">取消</button>
            <button data-rte-own type="button" class="rte-modal-confirm" title="按上面的纸张、边距、页眉页脚和页码排版" @click="rte.confirmPageSetup()">确认</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 跨文档：搜索其它文档，可插入同步块 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.crossDocOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.closeCrossDoc()"
      >
        <div data-rte-own class="rte-modal rte-crossdoc-modal" role="dialog" aria-label="跨文档">
          <h3 data-rte-own class="rte-modal-title">跨文档</h3>
          <p data-rte-own class="rte-modal-desc">
            搜索本账号可见的其它文档。点标题跳过去，点「插入同步块」把来源内容同步到本文。
          </p>
          <div data-rte-own class="rte-note-field rte-note-text-field" style="width: 100%; margin-bottom: 10px">
            <span data-rte-own class="rte-note-field-icon" aria-hidden="true">🔍</span>
            <input
              data-rte-own
              v-model="rte.crossDocQuery"
              type="text"
              class="rte-note-input"
              placeholder="按标题或正文搜索"
              title="输入关键词，最多 100 字，按 Enter 搜索"
              maxlength="100"
              @keydown.enter.prevent="rte.searchCrossDoc()"
            />
          </div>
          <div data-rte-own class="rte-crossdoc-actions">
            <button data-rte-own type="button" class="rte-btn" title="在本账号可见的文档里找" :disabled="rte.crossDocBusy" @click="rte.searchCrossDoc()">
              {{ rte.crossDocBusy ? '搜索中…' : '搜索' }}
            </button>
            <button data-rte-own type="button" class="rte-btn" title="关掉跨文档" @click="rte.closeCrossDoc()">关闭</button>
          </div>
          <p data-rte-own v-if="rte.crossDocError" class="rte-modal-desc is-error">{{ rte.crossDocError }}</p>
          <div data-rte-own v-if="rte.crossDocHits.length" class="rte-crossdoc-list">
            <div data-rte-own v-for="hit in rte.crossDocHits" :key="hit.documentId + '-' + (hit.panelId || '')" class="rte-crossdoc-item">
              <button
                data-rte-own
                type="button"
                class="rte-crossdoc-link"
                :title="'跳转到：' + hit.title"
                @click="rte.jumpToCrossDoc(hit)"
              >
                {{ hit.title }}
                <span v-if="hit.panelTitle" class="rte-crossdoc-panel">{{ hit.panelTitle }}</span>
              </button>
              <div data-rte-own v-if="hit.snippet" class="rte-crossdoc-snippet">{{ rte.syncBlockPreview(hit.snippet) }}</div>
              <button
                data-rte-own
                type="button"
                class="rte-bubble-btn"
                :disabled="rte.crossDocSyncing"
                :title="'把「' + hit.title + '」同步成块插到本文'"
                @click="rte.insertSyncBlock(hit)"
              >
                插入同步块
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- @ 提及权限：决定本文能提到哪些人 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.mentionPermOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.mentionPermOpen = false"
      >
        <div data-rte-own class="rte-modal rte-mention-perm-modal" role="dialog" aria-label="@ 提及权限">
          <h3 data-rte-own class="rte-modal-title">@ 提及权限</h3>
          <p data-rte-own class="rte-modal-desc">
            通讯录里的真人只在本文可见时才会出现在 @ 菜单里。不勾任何项表示不额外限制。
          </p>
          <div data-rte-own class="rte-mention-perm-body">
            <div data-rte-own class="rte-mention-perm-section">
              <div data-rte-own class="rte-mention-perm-label">可提及部门</div>
              <p data-rte-own v-if="!rte.directoryDepartments.length" class="rte-modal-desc">
                {{ rte.directoryLoading ? '正在读取通讯录…' : '通讯录里还没有部门信息' }}
              </p>
              <label data-rte-own v-for="dept in rte.directoryDepartments" :key="'perm-dept-' + dept" class="rte-mention-perm-item">
                <input
                  data-rte-own
                  type="checkbox"
                  :checked="rte.mentionPermDepartments.includes(dept)"
                  :title="'勾上后，@ 只出现「' + dept + '」的人。和角色同时勾时都要符合'"
                  @change="rte.toggleMentionPermValue(rte.mentionPermDepartments, dept)"
                />
                <span data-rte-own>{{ dept }}</span>
              </label>
            </div>
            <div data-rte-own class="rte-mention-perm-section">
              <div data-rte-own class="rte-mention-perm-label">可提及角色</div>
              <p data-rte-own v-if="!rte.directoryRoles.length" class="rte-modal-desc">通讯录里还没有角色信息</p>
              <label data-rte-own v-for="role in rte.directoryRoles" :key="'perm-role-' + role" class="rte-mention-perm-item">
                <input
                  data-rte-own
                  type="checkbox"
                  :checked="rte.mentionPermRoles.includes(role)"
                  :title="'勾上后，@ 只出现角色是「' + role + '」的人'"
                  @change="rte.toggleMentionPermValue(rte.mentionPermRoles, role)"
                />
                <span data-rte-own>{{ role }}</span>
              </label>
            </div>
          </div>
          <p data-rte-own v-if="rte.directoryError" class="rte-modal-desc is-error">{{ rte.directoryError }}</p>
          <div data-rte-own class="rte-modal-actions is-row">
            <button data-rte-own type="button" class="rte-btn" title="去掉勾选。保存后所有人都能被提及" @click="rte.resetMentionPermission()">清空</button>
            <button data-rte-own type="button" class="rte-btn" title="不保存这次权限" @click="rte.mentionPermOpen = false">取消</button>
            <button data-rte-own type="button" class="rte-btn is-primary" title="按勾选限制 @ 菜单里的人" @click="rte.saveMentionPermission()">保存</button>
          </div>
        </div>
      </div>
    </Teleport>
    <!-- 公式编辑器 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.formulaDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.onFormulaMask()"
      >
        <div data-rte-own
          class="rte-formula-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="公式编辑器"
          @mousedown.stop
        >
          <div data-rte-own class="rte-formula-header">
            <h3 data-rte-own class="rte-formula-title">公式编辑器</h3>
            <div data-rte-own class="rte-formula-modes">
              <span data-rte-own class="rte-formula-modes-label">公式排版</span>
              <button data-rte-own
                type="button"
                class="rte-formula-mode-btn"
                :class="{ active: rte.formulaMode === 'inline' }"
                title="公式嵌在这一行文字中间"
                @click="rte.setFormulaMode('inline')"
              >
                <span data-rte-own class="rte-mode-glyph">行内</span>
              </button>
              <button data-rte-own
                type="button"
                class="rte-formula-mode-btn"
                :class="{ active: rte.formulaMode === 'display' }"
                title="公式单独占一行，居中显示"
                @click="rte.setFormulaMode('display')"
              >
                <span data-rte-own class="rte-mode-glyph">行间</span>
              </button>
            </div>
          </div>

          <div data-rte-own class="rte-formula-body">
            <div data-rte-own class="rte-formula-left">
              <div data-rte-own class="rte-formula-symbols">
                <div data-rte-own
                  v-for="g in rte.FORMULA_SYMBOL_GROUPS"
                  :key="g.title"
                  class="rte-formula-group"
                >
                  <div data-rte-own class="rte-formula-group-title" :title="g.title === '希腊字母' ? '常用希腊字母' : g.title === '运算' ? '加减乘除、求和和积分' : g.title === '关系' ? '等于、不等和属于' : g.title === '结构' ? '根号、括号、上下标和分数' : '方向箭头'">{{ g.title }}</div>
                  <div data-rte-own class="rte-formula-group-items">
                    <button data-rte-own
                      v-for="it in g.items"
                      :key="it.tex + it.label"
                      type="button"
                      class="rte-formula-sym"
                      :title="'插入 ' + it.label + '，写法 ' + it.tex"
                      @click="rte.insertFormulaSymbol(it.tex)"
                    >
                      {{ it.label }}
                    </button>
                  </div>
                </div>
              </div>
              <textarea data-rte-own
                :ref="(el) => (rte.formulaTexareaRef = el)"
                v-model="rte.formulaTex"
                class="rte-formula-tex"
                placeholder="输入 TeX 公式"
                title="输入 TeX。点左边的符号会插到光标处，带括号的会把光标放进括号里"
                spellcheck="false"
              />
            </div>
            <div data-rte-own
              class="rte-formula-right"
              :class="{ expanded: rte.formulaPreviewExpanded }"
            >
              <button data-rte-own
                type="button"
                class="rte-formula-expand"
                :title="rte.formulaPreviewExpanded ? '收回预览' : '把预览放大'"
                @click="rte.formulaPreviewExpanded = !rte.formulaPreviewExpanded"
              >
                ⛶
              </button>
              <div data-rte-own
                v-if="rte.formulaPreviewHtml"
                class="rte-formula-preview"
                :class="{ display: rte.formulaMode === 'display' }"
                v-html="rte.formulaPreviewHtml"
              />
              <div data-rte-own v-else class="rte-formula-preview-ph">公式实时预览中...</div>
            </div>
          </div>
          <p data-rte-own v-if="rte.formulaError" class="rte-modal-desc is-error">{{ rte.formulaError }}</p>

          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="不插入公式" @click="rte.closeFormulaDialog">
              取消
            </button>
            <button data-rte-own type="button" class="rte-modal-confirm" title="把当前公式插入文档" @click="rte.confirmInsertFormula">
              确认
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 表格右键菜单 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.tableCtx.open"
        class="rte-table-ctx-mask"
        @mousedown="rte.closeTableCtx"
        @contextmenu.prevent="rte.closeTableCtx"
      >
        <div data-rte-own
          class="rte-table-ctx"
          :style="{ left: rte.tableCtx.x + 'px', top: rte.tableCtx.y + 'px' }"
          @mousedown.stop.prevent
        >
          <div data-rte-own
            v-for="group in TABLE_MENU_GROUPS"
            :key="'ctx-group-' + group.id"
            class="rte-table-ctx-group"
          >
            <button data-rte-own
              type="button"
              :class="{ active: tableCtxGroup === group.id }"
              :title="group.title"
              :aria-expanded="tableCtxGroup === group.id"
              @mouseenter="openTableCtxGroup(group.id, $event)"
              @click.stop="openTableCtxGroup(group.id, $event)"
            >
              <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS[group.id]" /></span>
              <span data-rte-own class="rte-table-ctx-label">{{ group.label }}</span>
              <span data-rte-own class="rte-table-ctx-caret" aria-hidden="true">▸</span>
            </button>
            <div data-rte-own
              v-if="tableCtxGroup === group.id"
              class="rte-table-ctx-flyout"
              :style="{ top: tableCtxFlyout.top + 'px', left: tableCtxFlyout.left + 'px' }"
              @mousedown.stop
            >
              <template v-for="op in tableCtxOps(group.keys)" :key="'ctx-' + op.key">
                <div data-rte-own v-if="op.insertCount" class="rte-table-insert-line">
                  <button data-rte-own type="button" :title="op.title" @click="op.run()">
                    <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS[op.key]" /></span>
                    <span data-rte-own>{{ op.label }}</span>
                  </button>
                  <label data-rte-own class="rte-table-insert-count">
                    <input data-rte-own
                      v-model.number="rte.tableInsertCounts[op.key]"
                      type="number"
                      min="1"
                      max="99"
                      step="1"
                      inputmode="numeric"
                      :aria-label="op.label + '数量'"
                      title="填几就插入几行或几列，最少 1"
                      @mousedown.stop="rte.rememberTableInsertSelection()"
                      @click.stop
                      @keydown.stop
                      @blur="rte.normalizeTableInsertCount(op.key)"
                    />
                  </label>
                </div>
                <button data-rte-own
                  v-else
                  type="button"
                  :class="{ danger: op.danger, active: op.active?.() }"
                  :title="op.title"
                  :disabled="op.disabled?.()"
                  @click="op.run()"
                >
                  <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS[op.key]" /></span>
                  <span data-rte-own>{{ op.label }}</span>
                </button>
              </template>
              <template v-if="group.id === 'cell'">
                <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
                <div data-rte-own class="rte-table-cell-style-title" style="padding: 4px 10px">单元格背景</div>
                <div data-rte-own class="rte-table-swatches" style="padding: 0 10px 8px">
                  <button data-rte-own
                    v-for="p in rte.TABLE_CELL_BG_PRESETS"
                    :key="'ctx-bg-' + p.value"
                    type="button"
                    class="rte-table-swatch"
                    :title="p.value ? '单元格底色：' + p.label : '去掉单元格底色'"
                    :style="p.value ? { background: p.value } : undefined"
                    @click="rte.setTableCellBg(p.value); rte.closeTableCtx()"
                  >{{ p.value ? '' : '无' }}</button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 紧凑「更多」进入的表格操作面板 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.tableOpsSheetOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.closeTableOpsSheet"
      >
        <div data-rte-own
          class="rte-table-ops-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="表格操作"
          @mousedown.stop
        >
          <h3 data-rte-own class="rte-table-title">表格操作</h3>
          <div data-rte-own class="rte-table-ops-list">
            <template v-for="group in TABLE_MENU_GROUPS" :key="'sheet-group-' + group.id">
              <div data-rte-own class="rte-table-cell-style-title" :title="group.title">{{ group.label }}</div>
              <template v-for="op in tableCtxOps(group.keys)" :key="'sheet-' + op.key">
              <div data-rte-own v-if="op.insertCount" class="rte-table-insert-line">
                <button data-rte-own
                  type="button"
                  class="rte-table-ops-item"
                  :title="op.title"
                  @click="op.run()"
                >
                  <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS[op.key]" /></span>
                  <span data-rte-own>{{ op.label }}</span>
                </button>
                <label data-rte-own class="rte-table-insert-count">
                  <input data-rte-own
                    v-model.number="rte.tableInsertCounts[op.key]"
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    inputmode="numeric"
                    :aria-label="op.label + '数量'"
                    title="填几就插入几行或几列，最少 1"
                    @mousedown.stop="rte.rememberTableInsertSelection()"
                    @click.stop
                    @keydown.stop
                    @blur="rte.normalizeTableInsertCount(op.key)"
                  />
                </label>
              </div>
              <template v-else-if="!op.insertCount">
                <div data-rte-own v-if="op.sepBefore" class="rte-menu-sep" aria-hidden="true" />
                <button data-rte-own
                  type="button"
                  class="rte-table-ops-item"
                  :class="{ danger: op.danger, active: op.active?.() }"
                  :title="op.title"
                  :disabled="op.disabled?.()"
                  @click="op.run()"
                >
                  <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS[op.key]" /></span>
                  <span data-rte-own>{{ op.label }}</span>
                </button>
              </template>
              </template>
            </template>
            <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
            <div data-rte-own class="rte-table-cell-style">
              <div data-rte-own class="rte-table-cell-style-title">单元格背景</div>
              <div data-rte-own class="rte-table-swatches">
                <button data-rte-own
                  v-for="p in rte.TABLE_CELL_BG_PRESETS"
                  :key="'tbg-' + p.value"
                  type="button"
                  class="rte-table-swatch"
                  :title="p.value ? '单元格底色：' + p.label : '去掉单元格底色'"
                  :style="p.value ? { background: p.value } : { background: 'transparent' }"
                  @click="rte.setTableCellBg(p.value)"
                >
                  <span data-rte-own v-if="!p.value">无</span>
                </button>
              </div>
              <div data-rte-own class="rte-table-cell-style-title">边框样式</div>
              <div data-rte-own class="rte-table-border-styles">
                <button data-rte-own
                  v-for="p in rte.TABLE_BORDER_STYLE_PRESETS"
                  :key="'tbs-' + p.value"
                  type="button"
                  class="rte-table-ops-item rte-table-border-btn"
                  :title="p.value === 'solid' ? '单元格用实线边框' : p.value === 'dashed' ? '单元格用虚线边框' : p.value === 'dotted' ? '单元格用点线边框' : p.value === 'double' ? '单元格用双线边框' : '去掉单元格边框'"
                  @click="rte.setTableCellBorderStyle(p.value)"
                >
                  {{ p.label }}
                </button>
              </div>
              <div data-rte-own class="rte-table-cell-style-title">边框颜色</div>
              <div data-rte-own class="rte-table-swatches">
                <button data-rte-own
                  type="button"
                  class="rte-table-swatch"
                  title="去掉单独的边框颜色，用默认灰"
                  @click="rte.setTableCellBorderColor('')"
                >无</button>
                <button data-rte-own
                  v-for="c in ['#d1d5db', '#9ca3af', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#111827']"
                  :key="'tbc-' + c"
                  type="button"
                  class="rte-table-swatch"
                  :style="{ background: c }"
                  :title="'边框用 ' + c"
                  @click="rte.setTableCellBorderColor(c)"
                />
              </div>
            </div>
            <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
            <button data-rte-own
              type="button"
              class="rte-table-ops-item"
              title="打开行列对话框，自己填行数和列数"
              @click="rte.closeTableOpsSheet(); rte.openTableDialog()"
            >
              <span data-rte-own class="rte-table-ctx-ico"><component :is="TABLE_MENU_ICONS['insert-table']" /></span>
              <span data-rte-own>插入表格</span>
            </button>
          </div>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="关掉表格操作" @click="rte.closeTableOpsSheet">
              取消
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 插入表格 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.tableDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.onTableDialogMask()"
      >
        <div data-rte-own
          class="rte-table-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入表格"
          @mousedown.stop
        >
          <h3 data-rte-own class="rte-table-title">插入表格</h3>

          <div data-rte-own
            class="rte-table-grid-picker"
            role="grid"
            aria-label="选择表格尺寸"
            @mouseleave="rte.onTableGridLeave"
          >
            <div data-rte-own
              v-for="r in rte.TABLE_GRID_MAX_ROWS"
              :key="'tg-r-' + r"
              class="rte-table-grid-row"
              role="row"
              :style="{ gridTemplateColumns: `repeat(${rte.TABLE_GRID_MAX_COLS}, minmax(0, 1fr))` }"
            >
              <button data-rte-own
                v-for="c in rte.TABLE_GRID_MAX_COLS"
                :key="'tg-' + r + '-' + c"
                type="button"
                class="rte-table-grid-cell"
                role="gridcell"
                :class="{
                  hot:
                    (rte.tableGridHover.rows || rte.tableRows) >= r &&
                    (rte.tableGridHover.cols || rte.tableCols) >= c,
                }"
                :title="r + ' × ' + c"
                :aria-label="r + ' 行 ' + c + ' 列'"
                @mouseenter="rte.onTableGridHover(r, c)"
                @click="rte.pickTableGridSize(r, c)"
              />
            </div>
            <p data-rte-own v-if="rte.tableSizeHint" class="rte-modal-desc is-error">{{ rte.tableSizeHint }}</p>
            <div data-rte-own class="rte-table-grid-label" aria-live="polite">
              {{
                rte.tableGridHover.rows
                  ? rte.tableGridHover.rows + ' × ' + rte.tableGridHover.cols
                  : rte.tableRows + ' × ' + rte.tableCols
              }}
            </div>
          </div>

          <div data-rte-own class="rte-table-field">
            <span data-rte-own class="rte-table-field-icon" aria-hidden="true">
              <component data-rte-own :is="rte.IconTableRows" class="rte-table-field-svg" />
            </span>
            <input data-rte-own
              class="rte-table-input"
              type="number"
              min="1"
              max="100"
              :value="rte.tableRows"
              placeholder="输入表格行数（最大 100 行）"
              title="表格行数，最少 1 行，最多 100 行"
              @input="rte.onTableRowsInput"
            />
            <div data-rte-own class="rte-table-stepper">
              <button data-rte-own type="button" title="表格多一行" aria-label="表格多一行" @click="rte.stepTableRows(1)">▴</button>
              <button data-rte-own type="button" title="表格少一行" aria-label="表格少一行" @click="rte.stepTableRows(-1)">▾</button>
            </div>
          </div>

          <div data-rte-own class="rte-table-field">
            <span data-rte-own class="rte-table-field-icon" aria-hidden="true">
              <component data-rte-own :is="rte.IconTableCols" class="rte-table-field-svg" />
            </span>
            <input data-rte-own
              class="rte-table-input"
              type="number"
              min="1"
              :max="rte.TABLE_GRID_MAX_COLS"
              :value="rte.tableCols"
              placeholder="输入表格列数（最大 16 列）"
              title="表格列数，最少 1 列，最多 16 列"
              @input="rte.onTableColsInput"
            />
            <div data-rte-own class="rte-table-stepper">
              <button data-rte-own type="button" title="表格多一列" aria-label="表格多一列" @click="rte.stepTableCols(1)">▴</button>
              <button data-rte-own type="button" title="表格少一列" aria-label="表格少一列" @click="rte.stepTableCols(-1)">▾</button>
            </div>
          </div>

          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="不插入表格" @click="rte.closeTableDialog">
              取消
            </button>
            <button data-rte-own type="button" class="rte-modal-confirm" title="按填的行数和列数插入表格" @click="rte.confirmInsertTable">
              插入
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 导入链接（公众号） -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.linkImportOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.closeImportLinkDialog"
      >
        <div data-rte-own
          class="rte-link-import-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="导入链接"
          @mousedown.stop
        >
          <h3 data-rte-own class="rte-table-title">导入链接</h3>
          <p data-rte-own class="rte-link-import-hint">
            粘贴公众号文章 URL。若浏览器跨域无法抓取正文，将插入可点击链接占位。
          </p>
          <div data-rte-own class="rte-note-field rte-note-link-field" style="margin-bottom: 16px">
            <span data-rte-own class="rte-note-field-icon rte-note-link-icon" aria-hidden="true">🔗</span>
            <input data-rte-own
              v-model="rte.linkImportUrl"
              type="url"
              class="rte-note-input"
              placeholder="输入公众号文章链接"
              title="公众号文章地址，按 Enter 开始导入"
              maxlength="2000"
              @keydown.enter.prevent="rte.confirmImportLink"
            />
          </div>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="不导入这篇链接" @click="rte.closeImportLinkDialog">
              取消
            </button>
            <button data-rte-own
              type="button"
              class="rte-modal-confirm"
              title="抓取标题和摘要；跨域失败时插入可点的链接"
              :disabled="rte.linkImportBusy"
              @click="rte.confirmImportLink"
            >
              {{ rte.linkImportBusy ? '导入中…' : '导入' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 查找 / 替换：贴在视口右上，不挡住正文 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.findDialogOpen"
        class="rte-find-layer"
      >
        <div data-rte-own
          class="rte-link-dialog rte-find-dialog rte-find-bar"
          role="dialog"
          aria-label="查找与替换"
          :style="rte.findDialogStyle"
          @mousedown.stop
          @keydown.esc.prevent="rte.closeFindDialog"
        >
          <h3 data-rte-own
            class="rte-table-title rte-find-drag"
            title="按住拖动查找窗口"
            @pointerdown="rte.onFindDialogDragStart"
            @pointermove="rte.onFindDialogDragMove"
            @pointerup="rte.onFindDialogDragEnd"
            @pointercancel="rte.onFindDialogDragEnd"
          >查找与替换</h3>
          <div data-rte-own class="rte-note-field rte-note-text-field" style="width: 100%; margin-bottom: 10px">
            <span data-rte-own class="rte-note-field-icon" aria-hidden="true">🔍</span>
            <input data-rte-own
              v-model="rte.findQuery"
              type="text"
              class="rte-note-input rte-find-query"
              placeholder="查找"
              maxlength="200"
              title="输入要找的文字，按 Enter 跳到下一处"
              @input="rte.onFindQueryInput"
              @keydown.enter.prevent="rte.findGo(1)"
            />
          </div>
          <div data-rte-own class="rte-note-field rte-note-text-field" style="width: 100%; margin-bottom: 10px">
            <span data-rte-own class="rte-note-field-icon" aria-hidden="true">⇄</span>
            <input data-rte-own
              v-model="rte.findReplaceText"
              type="text"
              class="rte-note-input"
              placeholder="替换为"
              title="输入要换成的文字，按 Enter 替换当前这一处"
              maxlength="200"
              @keydown.enter.prevent="rte.doReplaceOne"
            />
          </div>
          <div data-rte-own class="rte-find-opts">
            <label data-rte-own class="rte-find-case">
              <span data-rte-own>范围</span>
              <select data-rte-own v-model="rte.findScope" aria-label="查找范围" title="选择在全文、标题、表格、代码还是题注里找" @change="rte.refreshFindMatches(true)">
                <option data-rte-own value="all">全文</option>
                <option data-rte-own value="heading">标题</option>
                <option data-rte-own value="table">表格</option>
                <option data-rte-own value="code">代码块</option>
                <option data-rte-own value="caption">题注</option>
              </select>
            </label>
            <label data-rte-own class="rte-find-case">
              <input data-rte-own v-model="rte.findCaseSensitive" type="checkbox" title="大写和小写不算同一处" @change="rte.refreshFindMatches(true)" />
              <span data-rte-own>区分大小写</span>
            </label>
            <label data-rte-own class="rte-find-case">
              <input data-rte-own v-model="rte.findWholeWord" type="checkbox" title="只匹配完整的词，不匹配词的一部分" @change="rte.refreshFindMatches(true)" />
              <span data-rte-own>全词匹配</span>
            </label>
            <label data-rte-own class="rte-find-case">
              <input data-rte-own v-model="rte.findRegex" type="checkbox" title="按正则表达式查找" @change="rte.refreshFindMatches(true)" />
              <span data-rte-own>正则</span>
            </label>
            <label data-rte-own v-if="rte.findRegex" class="rte-find-case">
              <input data-rte-own v-model="rte.findMultiline" type="checkbox" title="正则可以跨行匹配" @change="rte.refreshFindMatches(true)" />
              <span data-rte-own>多行</span>
            </label>
            <span data-rte-own class="rte-find-status" role="status" aria-live="polite">{{ rte.findStatusText }}</span>
          </div>
          <div data-rte-own class="rte-find-actions">
            <div data-rte-own class="rte-modal-actions">
              <button data-rte-own type="button" class="rte-modal-cancel" title="跳到上一处匹配" :disabled="!rte.canReplaceFind" @click="rte.findGo(-1)">上一个</button>
              <button data-rte-own type="button" class="rte-modal-cancel" title="跳到下一处匹配" :disabled="!rte.canReplaceFind" @click="rte.findGo(1)">下一个</button>
            </div>
            <div data-rte-own class="rte-modal-actions rte-find-replace-row">
              <button data-rte-own type="button" class="rte-modal-cancel" title="只把这一处换成新文字" :disabled="!rte.canReplaceFind" @click="rte.doReplaceOne">替换当前</button>
              <button data-rte-own type="button" class="rte-modal-confirm" title="把所有匹配都换成新文字" :disabled="!rte.canReplaceFind" @click="rte.doReplaceAll">全部替换</button>
              <button data-rte-own type="button" class="rte-modal-cancel" title="关掉查找与替换" @click="rte.closeFindDialog">关闭</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div data-rte-own
        v-if="rte.presentOpen"
        :ref="(el) => (rte.presentRoot = el)"
        class="rte-present"
        role="dialog"
        aria-modal="true"
        aria-label="演示"
        tabindex="-1"
      >
        <div data-rte-own class="rte-present-top">
          <div data-rte-own class="rte-present-units" role="tablist" aria-label="翻页方式">
            <button data-rte-own type="button" :class="{ active: rte.presentUnit === 'block' }" title="一次翻一块内容" @click="rte.setPresentUnit('block')">按块</button>
            <button data-rte-own type="button" :class="{ active: rte.presentUnit === 'screen' }" title="一次翻一整屏" @click="rte.setPresentUnit('screen')">按屏</button>
          </div>
          <span data-rte-own class="rte-present-progress">{{ rte.presentIndex + 1 }} / {{ rte.presentSlides.length }}</span>
          <button data-rte-own type="button" class="rte-present-exit" title="结束演示，回到编辑" @click="rte.closePresent">退出</button>
        </div>
        <button data-rte-own type="button" class="rte-present-nav is-prev" aria-label="回到上一页" title="回到上一页" :disabled="rte.presentIndex === 0" @click="rte.stepPresent(-1)">‹</button>
        <div data-rte-own class="rte-present-stage" @click="rte.onPresentStageClick" v-html="rte.presentSlides[rte.presentIndex]"></div>
        <button data-rte-own type="button" class="rte-present-nav is-next" aria-label="去下一页" title="去下一页" :disabled="rte.presentIndex >= rte.presentSlides.length - 1" @click="rte.stepPresent(1)">›</button>
        <p data-rte-own class="rte-present-hint">方向键或空格翻页，Esc 退出。演示中不能编辑。</p>
      </div>
    </Teleport>

    <!-- 打印预览 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.printPreviewOpen"
        class="rte-modal-overlay rte-print-preview-overlay"
        @mousedown.self="rte.closePrintPreview"
      >
        <div data-rte-own
          class="rte-print-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="打印预览"
          @mousedown.stop
        >
          <div data-rte-own class="rte-print-preview-bar">
            <h3 data-rte-own class="rte-table-title">打印预览</h3>
            <div data-rte-own class="rte-print-preview-actions">
              <label data-rte-own class="rte-print-url-toggle">
                <input data-rte-own v-model="rte.printLinkUrls" type="checkbox" title="打印时在链接后面印出网址" />
                印出链接
              </label>
              <button data-rte-own type="button" class="rte-modal-cancel" title="关掉预览，不打印" @click="rte.closePrintPreview">取消</button>
              <button data-rte-own type="button" class="rte-modal-confirm" title="按当前预览送去打印" @click="rte.confirmPrintFromPreview">打印</button>
            </div>
          </div>
          <div data-rte-own class="rte-print-preview-paper" :style="rte.printPreviewMarginStyle" :data-writing-paper="rte.writingPaper || undefined">
            <div data-rte-own v-if="rte.pageChrome.header" class="rte-preview-header">{{ rte.pageChrome.header }}</div>
            <div data-rte-own v-html="rte.printPreviewHtml"></div>
            <div data-rte-own v-if="rte.pageChrome.footer || rte.previewPageLabel" class="rte-preview-footer">
              <span data-rte-own>{{ rte.pageChrome.footer }}</span>
              <span data-rte-own>{{ rte.previewPageLabel }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 书签列表（工具栏书签可双击打开；此处随 bookmarkPanelOpen） -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.bookmarkPanelOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.bookmarkPanelOpen = false"
      >
        <div data-rte-own class="rte-link-dialog" role="dialog" aria-modal="true" aria-label="书签" @mousedown.stop>
          <h3 data-rte-own class="rte-table-title">文档书签</h3>
          <div data-rte-own v-if="!rte.listBookmarks().length" class="rte-find-status">暂无书签，选中文字后点「书签」插入</div>
          <button data-rte-own
            v-for="b in rte.listBookmarks()"
            :key="b.id"
            type="button"
            class="rte-import-item"
            style="width: 100%; margin-bottom: 6px"
            :title="'跳到书签：' + b.label"
            @click="rte.jumpToBookmark(b.id); rte.bookmarkPanelOpen = false"
          >
            <span data-rte-own>{{ b.label }}</span>
            <span data-rte-own class="rte-import-pill">#{{ b.id.slice(0, 10) }}</span>
          </button>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="在光标处新建一个书签" @click="rte.insertBookmark">新建书签</button>
            <button data-rte-own type="button" class="rte-modal-confirm" title="关掉书签列表" @click="rte.bookmarkPanelOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 脚注汇总 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.footnotePanelOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.footnotePanelOpen = false"
      >
        <div data-rte-own class="rte-link-dialog" role="dialog" aria-modal="true" aria-label="脚注" @mousedown.stop>
          <h3 data-rte-own class="rte-table-title">脚注</h3>
          <div data-rte-own v-if="!(rte.editor && rte.collectFootnotes(rte.editor).length)" class="rte-find-status">
            暂无脚注
          </div>
          <button data-rte-own
            v-for="fn in rte.editor ? rte.collectFootnotes(rte.editor) : []"
            :key="fn.id"
            type="button"
            class="rte-import-item"
            style="width: 100%; margin-bottom: 6px; text-align: left"
            :title="'跳到第 ' + fn.n + ' 条脚注'"
            @click="rte.jumpToPos(rte.editor!, fn.from)"
          >
            <span data-rte-own>[{{ fn.n }}] {{ fn.text }}</span>
          </button>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="在光标处加一条脚注" @click="rte.insertFootnoteAtCursor">新建</button>
            <button data-rte-own
              type="button"
              class="rte-modal-cancel"
              title="按文中顺序重新编号"
              @click="rte.editor && rte.renumberFootnotes(rte.editor)"
            >
              重编号
            </button>
            <button data-rte-own type="button" class="rte-modal-confirm" title="关掉脚注列表" @click="rte.footnotePanelOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 水印 / 外链 / 审计 / 文内改写 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.governOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.governOpen = false"
      >
        <div data-rte-own class="rte-link-dialog rte-govern-dialog" role="dialog" aria-modal="true" aria-label="文档治理" @mousedown.stop>
          <div data-rte-own class="rte-govern-tabs">
            <button data-rte-own type="button" :class="{ active: rte.governTab === 'watermark' }" title="设置盖在页面上的水印，不写进正文" @click="rte.governTab = 'watermark'">水印</button>
            <button data-rte-own type="button" :class="{ active: rte.governTab === 'outbound' }" title="设置打开站外链接前是否确认，以及直接打开的主机" @click="rte.governTab = 'outbound'; rte.refreshExternalLinks()">外链</button>
            <button data-rte-own type="button" :class="{ active: rte.governTab === 'audit' }" title="看水印、外链、改写和导出的记录" @click="rte.governTab = 'audit'">审计</button>
            <button data-rte-own type="button" :class="{ active: rte.governTab === 'ai' }" title="用选中文字和紧挨着的上文改写，不调用外部模型" @click="rte.governTab = 'ai'">文内 AI</button>
          </div>

          <div v-if="rte.governTab === 'watermark'" data-rte-own class="rte-govern-pane">
            <p data-rte-own class="rte-govern-note">水印盖在页面上，不写进正文。</p>
            <div data-rte-own class="rte-govern-presets">
              <button
                v-for="preset in rte.WATERMARK_PRESETS"
                :key="preset"
                data-rte-own
                type="button"
                class="rte-import-item"
                :title="'把水印文字换成「' + preset + '」，还要点保存'"
                @click="rte.applyWatermarkPreset(preset)"
              >
                {{ preset }}
              </button>
            </div>
            <input
              data-rte-own
              class="rte-page-chrome-input"
              type="text"
              maxlength="24"
              :value="rte.watermarkDraft"
              title="水印文字，最多 24 字。留空再保存就关掉水印"
              placeholder="水印文字，留空并保存即关闭"
              @input="rte.onWatermarkDraftInput"
            />
            <div data-rte-own class="rte-modal-actions">
              <button data-rte-own type="button" class="rte-modal-confirm" title="把上面的文字盖到页面上" @click="rte.saveWatermark">保存</button>
            </div>
          </div>

          <div v-else-if="rte.governTab === 'outbound'" data-rte-own class="rte-govern-pane">
            <p data-rte-own class="rte-govern-note">站外的 http(s) 链接打开前需要确认。白名单里的主机直接打开。</p>
            <label data-rte-own class="rte-govern-check">
              <input data-rte-own type="checkbox" title="勾上后，打开站外链接前要再确认一次。改完立即生效" :checked="rte.outboundPolicy.confirmExternal" @change="rte.toggleOutboundConfirm" />
              打开外链前确认
            </label>
            <textarea
              data-rte-own
              class="rte-govern-hosts"
              rows="4"
              :value="rte.outboundHostsDraft"
              title="每行一个主机。这些地址直接打开，不用再确认"
              placeholder="每行一个主机，例如 feishu.cn"
              @input="rte.onOutboundHostsInput"
            />
            <div data-rte-own class="rte-modal-actions">
              <button data-rte-own type="button" class="rte-modal-confirm" title="保存上面的主机白名单" @click="rte.saveOutboundPolicy">保存策略</button>
            </div>
            <p data-rte-own class="rte-govern-note">本文中的外链</p>
            <p v-if="!rte.externalLinkRows.length" data-rte-own class="rte-govern-empty">还没有外链。</p>
            <button
              v-for="row in rte.externalLinkRows"
              :key="row.href"
              data-rte-own
              type="button"
              class="rte-import-item rte-govern-link"
              :title="'打开 ' + row.host"
              @click="rte.requestOpenHref(row.href)"
            >
              {{ row.host }} · {{ row.href }}
            </button>
          </div>

          <div v-else-if="rte.governTab === 'audit'" data-rte-own class="rte-govern-pane">
            <p data-rte-own class="rte-govern-note">水印、外链、文内改写和导出会记在这里，随文档保存。</p>
            <p v-if="!rte.auditLog.length" data-rte-own class="rte-govern-empty">还没有记录。</p>
            <div data-rte-own class="rte-audit-list">
              <div v-for="event in [...rte.auditLog].reverse()" :key="event.id" data-rte-own class="rte-audit-row">
                <span data-rte-own class="rte-audit-action">{{ rte.AUDIT_ACTION_LABEL[event.action] }}</span>
                <span data-rte-own>{{ event.detail }}</span>
                <span data-rte-own class="rte-audit-meta">{{ event.actor }} · {{ rte.formatAuditTime(event.at) }}</span>
              </div>
            </div>
          </div>

          <div v-else data-rte-own class="rte-govern-pane">
            <p data-rte-own class="rte-govern-note">改写只用选中的文字和紧挨着的上文，不调用外部模型。</p>
            <button
              v-for="mode in rte.INLINE_AI_MODES"
              :key="mode.id"
              data-rte-own
              type="button"
              class="rte-import-item rte-govern-link"
              :title="mode.title"
              @click="rte.rewriteSelection(mode.id)"
            >
              {{ mode.label }} · {{ mode.title }}
            </button>
          </div>

          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="关掉文档治理" @click="rte.governOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Wave21 检查报告 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.wave21ReportOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.wave21ReportOpen = false"
      >
        <div data-rte-own class="rte-link-dialog rte-optimize-dialog" role="dialog" aria-modal="true" @mousedown.stop>
          <h3 data-rte-own class="rte-table-title">{{ rte.wave21ReportTitle }}</h3>
          <div data-rte-own class="rte-wave21-report-list">
            <div data-rte-own
              v-for="(line, idx) in rte.wave21ReportLines"
              :key="'w21r-' + idx"
              class="rte-optimize-line"
              :class="{ 'is-done': line.done }"
            >
              <button data-rte-own
                v-if="line.pos != null"
                type="button"
                class="rte-import-item"
                title="滚到文档里的这一处"
                @click="rte.jumpWave21Report(line.pos)"
              >
                {{ line.done ? '✓ ' : '' }}{{ line.text }}
              </button>
              <p data-rte-own v-else class="rte-optimize-note">{{ line.done ? '✓ ' : '' }}{{ line.text }}</p>
              <span data-rte-own v-if="line.actions?.length" class="rte-optimize-actions">
                <button data-rte-own
                  v-for="action in line.actions"
                  :key="action.id"
                  type="button"
                  :title="action.id === 'continueList' ? '接上这段编号' : action.id === 'makeHeader' ? '把表格第一行标成表头' : action.id === 'layout12' ? '这组图片排成左一右二' : action.id === 'layout21' ? '这组图片排成左二右一' : '这组图片排成上下两行'"
                  @click="rte.applyOptimizeAction(action)"
                >
                  {{ action.label }}
                </button>
              </span>
            </div>
          </div>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own
              v-if="rte.optimizePendingCount"
              type="button"
              class="rte-modal-cancel"
              title="把还没处理的项写成文末待办"
              @click="rte.appendOptimizeChecklist"
            >
              写入文末清单
            </button>
            <button data-rte-own type="button" class="rte-modal-confirm" title="关掉检查报告" @click="rte.wave21ReportOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 交叉引用 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.xrefDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.xrefDialogOpen = false"
      >
        <div data-rte-own
          class="rte-link-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="交叉引用"
          @mousedown.stop
          @keydown="rte.onXrefDialogKeydown"
        >
          <h3 data-rte-own class="rte-table-title">插入交叉引用</h3>
          <p data-rte-own class="rte-ask-message">选择标题、图或表。↑↓ 选择，Enter 插入，Esc 关闭</p>
          <input data-rte-own
            v-model="rte.xrefQuery"
            class="rte-shortcuts-search"
            type="search"
            placeholder="搜索标题或图表，中英文均可"
            title="搜标题、图或表，中英文都可以"
            aria-label="搜索交叉引用"
          />
          <div data-rte-own v-if="!rte.xrefTargets.length" class="rte-ask-message">暂无可用目标，请先添加标题或带题注的图/表。</div>
          <div data-rte-own v-else-if="!rte.filteredXrefTargets.length" class="rte-ask-message">没有匹配的引用</div>
          <button data-rte-own
            v-for="(tg, idx) in rte.filteredXrefTargets"
            :key="tg.id + '-' + tg.pos"
            type="button"
            class="rte-import-item"
            :class="{ 'is-active': idx === rte.xrefIndex }"
            style="width: 100%; margin-bottom: 6px; text-align: left"
            :title="'插入指向「' + tg.label + '」的交叉引用'"
            @mouseenter="rte.xrefIndex = idx"
            @click="rte.confirmInsertXref(tg)"
          >
            <span data-rte-own>{{ tg.kind === 'heading' ? '标题' : tg.kind === 'figure' ? '图' : '表' }} · {{ tg.label }}</span>
          </button>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="不插入交叉引用" @click="rte.xrefDialogOpen = false">取消</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 一键生成 ECharts 图表 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.echartsDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.echartsDialogOpen = false"
      >
        <div data-rte-own
          class="rte-link-dialog rte-echarts-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入图表"
          @mousedown.stop
        >
          <h3 data-rte-own class="rte-table-title">一键生成图表</h3>
          <p data-rte-own class="rte-ask-message">选择图表类型，插入后带示例数据；选中图表可在属性面板改类型 / 改数据。</p>
          <div data-rte-own class="rte-echarts-type-list">
            <div data-rte-own class="rte-echarts-cats">
              <button
                v-for="cat in rte.ECHARTS_CATEGORIES"
                :key="'ect-' + cat.id"
                data-rte-own
                type="button"
                class="rte-import-item"
                :class="{ 'is-active': rte.echartsDialogType === cat.id }"
                style="width: 100%; margin-bottom: 6px; text-align: left"
                :title="'看「' + cat.label + '」这一类，共 ' + cat.templates.length + ' 种'"
                @click="rte.selectEchartsDialogCategory(cat.id)"
              >
                <strong data-rte-own>{{ cat.label }}</strong>
                <span data-rte-own class="rte-menu-hint">{{ cat.templates.length }} 种</span>
              </button>
            </div>
            <div data-rte-own class="rte-echarts-subtypes">
              <button
                v-for="tpl in echartsDialogTemplates"
                :key="'ectpl-' + tpl.id"
                data-rte-own
                type="button"
                class="rte-import-item"
                :class="{ 'is-active': rte.echartsDialogTemplateId === tpl.id }"
                style="width: 100%; margin-bottom: 6px; text-align: left"
                :title="tpl.hint ? tpl.label + '：' + tpl.hint : '用「' + tpl.label + '」的示例数据'"
                @click="rte.echartsDialogTemplateId = tpl.id"
              >
                <span data-rte-own>{{ tpl.label }}</span>
                <span data-rte-own class="rte-menu-hint">{{ tpl.hint }}</span>
              </button>
            </div>
          </div>
          <div data-rte-own class="rte-note-field" style="width: 100%; margin-bottom: 8px">
            <input
              data-rte-own
              v-model="rte.echartsDialogTitle"
              class="rte-note-input"
              type="text"
              maxlength="60"
              title="图表标题，最多 60 字，可以留空"
              placeholder="图表标题（可留空）"
            />
          </div>
          <label data-rte-own class="rte-ask-message" style="display: flex; gap: 6px; align-items: center">
            <input
              data-rte-own
              v-model="rte.echartsDialogUseTable"
              type="checkbox"
              title="用光标所在表格的数据。光标不在表格里时不能勾"
              :disabled="!rte.echartsDialogTable"
            />
            <span data-rte-own>
              用光标所在表格的数据生成
              <template v-if="!rte.echartsDialogTable">（当前光标不在表格里）</template>
            </span>
          </label>
          <p data-rte-own class="rte-ask-message">提示：图表内容不参与逐条修订；单个文档图表超过 20 个会提示。</p>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="不插入图表" @click="rte.echartsDialogOpen = false">取消</button>
            <button
              data-rte-own
              type="button"
              class="rte-modal-confirm"
              @click="rte.applyEchartsDialog({ type: rte.echartsDialogType, templateId: rte.echartsDialogTemplateId, title: rte.echartsDialogTitle, useTable: rte.echartsDialogUseTable })"
              title="按所选类型插入。勾了表格就用表格数据，否则用示例数据"
            >插入</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 阅读时长 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.readTimeDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.readTimeDialogOpen = false"
      >
        <div data-rte-own class="rte-link-dialog" role="dialog" aria-modal="true" aria-label="阅读时长" @mousedown.stop>
          <h3 data-rte-own class="rte-table-title">阅读时长估算</h3>
          <p data-rte-own class="rte-ask-message">基于全文去空白字数 {{ rte.charCount }}</p>
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>慢读（约 250 字/分）</span><strong data-rte-own>{{ rte.estimateReadingMinutes(rte.charCount, 250) }} 分钟</strong></div>
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>常速（约 400 字/分）</span><strong data-rte-own>{{ rte.estimateReadingMinutes(rte.charCount, 400) }} 分钟</strong></div>
          <div data-rte-own class="rte-wordstats-row"><span data-rte-own>快读（约 600 字/分）</span><strong data-rte-own>{{ rte.estimateReadingMinutes(rte.charCount, 600) }} 分钟</strong></div>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-confirm" title="关掉阅读时长" @click="rte.readTimeDialogOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 文本片段 Snippets -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.snippetDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.snippetDialogOpen = false"
      >
        <div data-rte-own class="rte-link-dialog rte-snippet-dialog" role="dialog" aria-modal="true" aria-label="文本片段" @mousedown.stop>
          <h3 data-rte-own class="rte-table-title">文本片段</h3>
          <button data-rte-own
            v-for="sn in rte.snippetList"
            :key="sn.id"
            type="button"
            class="rte-import-item"
            style="width: 100%; margin-bottom: 6px; text-align: left"
            :title="'把「' + sn.title + '」插到光标处'"
            @click="rte.insertSnippet(sn)"
          >
            <strong data-rte-own>{{ sn.title }}</strong>
            <div data-rte-own class="rte-ask-message" style="margin: 4px 0 0">{{ sn.body.slice(0, 80) }}{{ sn.body.length > 80 ? '…' : '' }}</div>
          </button>
          <div data-rte-own class="rte-menu-sep" style="margin: 10px 0" />
          <p data-rte-own class="rte-ask-message">{{ rte.snippetEditing ? '编辑片段' : '新建片段' }}</p>
          <div data-rte-own class="rte-note-field" style="width: 100%; margin-bottom: 8px">
            <input data-rte-own v-model="rte.snippetTitle" class="rte-note-input" type="text" maxlength="40" title="片段标题，最多 40 字" placeholder="片段标题" />
          </div>
          <textarea data-rte-own
            v-model="rte.snippetBody"
            class="rte-note-input"
            rows="4"
            maxlength="2000"
            title="片段正文，最多 2000 字。插入时原样放进文档"
            placeholder="片段正文"
            style="width: 100%; margin-bottom: 8px; resize: vertical"
          />
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="关掉文本片段" @click="rte.snippetDialogOpen = false">关闭</button>
            <button data-rte-own
              v-if="rte.snippetEditing"
              type="button"
              class="rte-modal-cancel"
              title="删掉正在编辑的片段。删光后会回到内置片段"
              @click="rte.deleteSnippet(rte.snippetEditing)"
            >
              删除
            </button>
            <button data-rte-own type="button" class="rte-modal-cancel" title="清空表单，准备新建一段" @click="rte.startEditSnippet(null)">新建</button>
            <button data-rte-own type="button" class="rte-modal-confirm" title="保存标题和正文，供以后插入" @click="rte.saveSnippetForm">保存</button>
          </div>
          <div data-rte-own style="margin-top: 8px">
            <button data-rte-own
              v-for="sn in rte.snippetList"
              :key="'ed-' + sn.id"
              type="button"
              class="rte-bubble-btn"
              style="margin: 2px"
              :title="'把「' + sn.title + '」填进下面的表单再改'"
              @click="rte.startEditSnippet(sn)"
            >
              编辑·{{ sn.title }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 统一询问：输入 / 确认（替代原生 prompt/confirm） -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.askOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.onAskMask()"
      >
        <div data-rte-own
          class="rte-link-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="rte.askTitle"
          @mousedown.stop
        >
          <h3 data-rte-own class="rte-table-title">{{ rte.askTitle }}</h3>
          <p data-rte-own v-if="rte.askMessage" class="rte-ask-message">{{ rte.askMessage }}</p>
          <div data-rte-own
            v-if="rte.askKind === 'prompt'"
            class="rte-note-field rte-note-text-field"
            style="width: 100%; margin-bottom: 12px"
          >
            <span data-rte-own class="rte-note-field-icon" aria-hidden="true">✎</span>
            <input data-rte-own
              :ref="(el) => (rte.askInputRef = el)"
              v-model="rte.askValue"
              type="text"
              class="rte-note-input"
              :placeholder="rte.askPlaceholder"
              :title="rte.askMaxlength ? '最多 ' + rte.askMaxlength + ' 字。Enter 确定，Esc 取消' : 'Enter 确定，Esc 取消'"
              :maxlength="rte.askMaxlength"
              @keydown.enter.prevent="rte.closeAskDialog('ok')"
              @keydown.esc.prevent="rte.closeAskDialog('cancel')"
            />
          </div>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="不改，关掉" @click="rte.closeAskDialog('cancel')">
              {{ rte.askCancelLabel }}
            </button>
            <button data-rte-own type="button" class="rte-modal-confirm" title="按填的内容继续" @click="rte.closeAskDialog('ok')">
              {{ rte.askConfirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 网页卡片插入 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.linkCardDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.closeLinkCardDialog"
      >
        <div data-rte-own
          class="rte-link-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入网页卡片"
          @mousedown.stop
        >
          <h3 data-rte-own class="rte-table-title">插入网页卡片</h3>
          <p data-rte-own class="rte-ask-message">仅支持 http/https；iframe 为 sandbox 受控嵌入，部分站点可能拒绝。</p>
          <div data-rte-own class="rte-note-field rte-note-link-field" style="width: 100%; margin-bottom: 12px">
            <span data-rte-own class="rte-note-field-icon rte-note-link-icon" aria-hidden="true">🔗</span>
            <input data-rte-own
              v-model="rte.linkCardHref"
              type="url"
              class="rte-note-input"
              placeholder="https://"
              title="网页地址，只支持 http 或 https，按 Enter 插入"
              maxlength="2000"
              @keydown.enter.prevent="rte.confirmLinkCardDialog"
            />
          </div>
          <div data-rte-own class="rte-ask-mode-row" role="radiogroup" aria-label="展示方式">
            <button data-rte-own
              type="button"
              class="rte-bubble-btn"
              :class="{ active: rte.linkCardMode === 'card' }"
              title="插成一张可点开的卡片"
              @click="rte.linkCardMode = 'card'"
            >
              链接卡片（推荐）
            </button>
            <button data-rte-own
              type="button"
              class="rte-bubble-btn"
              :class="{ active: rte.linkCardMode === 'iframe' }"
              title="把网页嵌进文档。不在白名单时会改成卡片"
              @click="rte.linkCardMode = 'iframe'"
            >
              受控 iframe
            </button>
          </div>
          <div data-rte-own class="rte-modal-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="不插入网页" @click="rte.closeLinkCardDialog">取消</button>
            <button data-rte-own type="button" class="rte-modal-confirm" title="按所选方式插入" @click="rte.confirmLinkCardDialog">插入</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 链接编辑弹层：贴在选区附近，点空白处关闭 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.linkDialogOpen"
        class="rte-link-popover-layer"
        @mousedown.self="rte.closeLinkDialog"
      >
        <div data-rte-own
          class="rte-link-dialog rte-link-popover"
          role="dialog"
          :style="rte.linkPopoverStyle"
          :aria-label="rte.linkDialogEditing ? '编辑链接' : '插入链接'"
          @mousedown.stop
          @keydown.esc.prevent="rte.closeLinkDialog"
        >
          <h3 data-rte-own class="rte-link-popover-title">{{ rte.linkDialogEditing ? '编辑链接' : '插入链接' }}</h3>
          <label data-rte-own class="rte-link-field">
            <span data-rte-own>文本</span>
            <input data-rte-own
              v-model="rte.linkText"
              type="text"
              placeholder="显示文字"
              title="链接上显示的文字，最多 500 字"
              maxlength="500"
              @keydown.enter.prevent="rte.confirmInsertLink"
            />
          </label>
          <label data-rte-own class="rte-link-field">
            <span data-rte-own>地址</span>
            <input data-rte-own
              :ref="(el) => (rte.linkHrefInputRef = el)"
              v-model="rte.linkHref"
              type="url"
              placeholder="https://"
              title="支持 http、https、mailto 和页内锚点，按 Enter 应用"
              maxlength="2000"
              @keydown.enter.prevent="rte.confirmInsertLink"
            />
          </label>
          <div data-rte-own class="rte-link-actions">
            <button data-rte-own
              v-if="rte.linkDialogEditing"
              type="button"
              class="rte-link-text-btn is-danger"
              title="去掉链接，文字留下来"
              @click="rte.unlinkSelection"
            >
              取消链接
            </button>
            <button data-rte-own
              v-if="rte.linkHref.trim()"
              type="button"
              class="rte-link-text-btn"
              title="打开这个地址"
              @click="rte.openCurrentLink"
            >
              打开
            </button>
            <button data-rte-own
              v-if="rte.linkHref.trim()"
              type="button"
              class="rte-link-text-btn"
              title="把链接地址复制到剪贴板"
              @click="rte.copyCurrentLinkUrl"
            >
              复制
            </button>
            <span data-rte-own class="rte-modal-actions-spacer" aria-hidden="true" />
            <button data-rte-own type="button" class="rte-link-text-btn" title="不改这条链接" @click="rte.closeLinkDialog">
              关闭
            </button>
            <button data-rte-own type="button" class="rte-link-primary" :title="rte.linkDialogEditing ? '按上面的文字和地址更新链接' : '把链接套到选中的文字上'" @click="rte.confirmInsertLink">
              {{ rte.linkDialogEditing ? '更新' : '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 选择附件：单栏分类素材（无外部链接） -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.attachDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.closeAttachDialog"
      >
        <div data-rte-own
          class="rte-image-dialog rte-attach-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="选择附件"
          @mousedown.stop
        >
          <div data-rte-own class="rte-attach-title-bar">
            <h3 data-rte-own class="rte-attach-title">选择附件</h3>
          </div>

          <div data-rte-own class="rte-image-personal">
            <aside data-rte-own class="rte-image-sidebar">
              <button data-rte-own
                type="button"
                class="rte-image-side-item"
                :class="{ active: rte.attachSidebarKey === 'all' }"
                title="看素材库里的全部附件"
                @click="rte.attachSidebarKey = 'all'"
              >
                <span data-rte-own class="rte-image-side-ico" aria-hidden="true">📎</span>
                <span data-rte-own class="rte-image-side-label">我的附件</span>
              </button>
              <button data-rte-own
                type="button"
                class="rte-image-side-item"
                :class="{ active: rte.attachSidebarKey === 'uncategorized' }"
                title="只看还没归类的附件"
                @click="rte.attachSidebarKey = 'uncategorized'"
              >
                <span data-rte-own class="rte-image-side-ico" aria-hidden="true">📁</span>
                <span data-rte-own class="rte-image-side-label">未分类</span>
              </button>
              <button data-rte-own
                v-for="cat in rte.attachCategories"
                :key="cat.id"
                type="button"
                class="rte-image-side-item"
                :class="{ active: rte.attachSidebarKey === cat.id }"
                title="只看这个分类里的附件"
                @click="rte.attachSidebarKey = cat.id"
              >
                <span data-rte-own class="rte-image-side-ico" aria-hidden="true">📁</span>
                <span data-rte-own class="rte-image-side-label">{{ cat.name }}</span>
                <span data-rte-own
                  class="rte-library-cat-delete"
                  role="button"
                  tabindex="0"
                  title="删除这个分类，里面的附件回到未分类"
                  aria-label="删除这个分类"
                  @click.stop="rte.deleteAttachCategory(cat.id)"
                  @keydown.enter.stop="rte.deleteAttachCategory(cat.id)"
                  @keydown.space.stop.prevent="rte.deleteAttachCategory(cat.id)"
                >×</span>
              </button>
              <div data-rte-own class="rte-image-side-spacer" />
              <div data-rte-own v-if="rte.attachAddingCategory" class="rte-image-add-cat-form">
                <input data-rte-own
                  v-model="rte.attachNewCategoryName"
                  type="text"
                  class="rte-image-add-cat-input"
                  placeholder="分类名称"
                  title="分类名称，最多 40 字，按 Enter 创建"
                  maxlength="40"
                  @keydown.enter.prevent="rte.confirmAddAttachCategory"
                  @keydown.esc.prevent="rte.attachAddingCategory = false"
                />
                <button data-rte-own
                  type="button"
                  class="rte-image-add-cat-ok"
                  title="用这个名字建分类"
                  @click="rte.confirmAddAttachCategory"
                >
                  确定
                </button>
              </div>
              <button data-rte-own
                v-else
                type="button"
                class="rte-image-side-item rte-image-add-cat"
                title="新建一个分类"
                @click="rte.startAddAttachCategory"
              >
                <span data-rte-own class="rte-image-side-ico" aria-hidden="true">📁+</span>
                <span data-rte-own class="rte-image-side-label">添加分类</span>
              </button>
            </aside>

            <div data-rte-own class="rte-image-main">
              <div data-rte-own class="rte-image-main-top">
                <div data-rte-own class="rte-library-tools">
                  <button data-rte-own
                    type="button"
                    class="rte-library-delete"
                    title="从素材库删除选中的附件"
                    :disabled="rte.attachSelectedIds.size === 0"
                    @click="rte.deleteSelectedAttaches()"
                  >
                    删除
                  </button>
                  <span data-rte-own v-if="rte.attachSelectedIds.size" class="rte-library-count">
                    已选 {{ rte.attachSelectedIds.size }}
                  </span>
                </div>
                <label data-rte-own class="rte-image-select-all">
                  <input data-rte-own
                    type="checkbox"
                    :checked="rte.attachSelectAll"
                    title="选中或取消当前分类里的全部附件"
                    @change="rte.onAttachSelectAllChange"
                  />
                  <span data-rte-own>本页全选</span>
                </label>
              </div>
              <div data-rte-own
                class="rte-image-grid"
                :class="{ empty: rte.filteredAttachAssets.length === 0 }"
              >
                <button data-rte-own
                  type="button"
                  class="rte-image-upload-card"
                  title="从本机选附件，归到当前分类"
                  @click="rte.triggerLocalAttachPick"
                >
                  <span data-rte-own class="rte-image-upload-ico" aria-hidden="true">
                    <svg data-rte-own width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <rect data-rte-own
                        x="10"
                        y="6"
                        width="28"
                        height="36"
                        rx="3"
                        stroke="#5b8cff"
                        stroke-width="2"
                      />
                      <path data-rte-own
                        d="M18 18h12M18 24h12M18 30h8"
                        stroke="#5b8cff"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                      <circle data-rte-own cx="36" cy="36" r="9" fill="#5b8cff" />
                      <path data-rte-own
                        d="M36 32v8M32 36h8"
                        stroke="#fff"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </svg>
                  </span>
                  <span data-rte-own class="rte-image-upload-label">本地附件上传</span>
                </button>
                <button data-rte-own
                  v-for="asset in rte.filteredAttachAssets"
                  :key="asset.id"
                  type="button"
                  class="rte-image-thumb rte-attach-thumb"
                  :class="{ selected: rte.attachSelectedIds.has(asset.id) }"
                  :title="'点一下选中「' + asset.name + '」，再点取消'"
                  @click="rte.toggleAttachSelect(asset.id)"
                >
                  <span data-rte-own class="rte-attach-thumb-ext">{{ rte.attachExtIcon(asset.name) }}</span>
                  <span data-rte-own class="rte-attach-thumb-name">{{ asset.name }}</span>
                  <span data-rte-own class="rte-attach-thumb-size">{{ rte.formatAttachSize(asset.size) }}</span>
                  <span data-rte-own
                    class="rte-library-card-delete"
                    role="button"
                    tabindex="0"
                    title="从素材库删除这一项"
                    aria-label="从素材库删除这一项"
                    @click.stop="rte.deleteAttachAsset(asset.id)"
                    @keydown.enter.stop="rte.deleteAttachAsset(asset.id)"
                    @keydown.space.stop.prevent="rte.deleteAttachAsset(asset.id)"
                  >×</span>
                  <span data-rte-own
                    class="rte-image-thumb-check"
                    :class="{ on: rte.attachSelectedIds.has(asset.id) }"
                  />
                </button>
              </div>
            </div>
          </div>

          <div data-rte-own class="rte-modal-actions rte-image-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="不插入附件" @click="rte.closeAttachDialog">
              取消
            </button>
            <button data-rte-own
              type="button"
              class="rte-modal-confirm"
              title="把选中的附件插到光标处"
              @click="rte.confirmInsertAttaches"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 插入图片：个人素材 / 外部链接 -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.imageDialogOpen"
        class="rte-modal-overlay"
        @mousedown.self="rte.onImageDialogMask()"
      >
        <div data-rte-own
          class="rte-image-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="插入图片"
          @mousedown.stop
        >
          <div data-rte-own class="rte-image-tabs">
            <button data-rte-own
              type="button"
              class="rte-image-tab"
              :class="{ active: rte.imageDialogTab === 'personal' }"
              title="从素材库选，或从本机上传"
              @click="rte.imageDialogTab = 'personal'"
            >
              个人素材
            </button>
            <button data-rte-own
              type="button"
              class="rte-image-tab"
              :class="{ active: rte.imageDialogTab === 'external' }"
              title="每行一个图片网址，一次可插多张"
              @click="rte.imageDialogTab = 'external'"
            >
              外部链接
            </button>
          </div>

          <div data-rte-own v-if="rte.imageDialogTab === 'personal'" class="rte-image-personal">
            <aside data-rte-own class="rte-image-sidebar">
              <button data-rte-own
                type="button"
                class="rte-image-side-item"
                :class="{ active: rte.imageSidebarKey === 'all' }"
                title="看素材库里的全部图片"
                @click="rte.imageSidebarKey = 'all'"
              >
                <span data-rte-own class="rte-image-side-ico" aria-hidden="true">👤</span>
                <span data-rte-own class="rte-image-side-label">我的图片</span>
              </button>
              <button data-rte-own
                type="button"
                class="rte-image-side-item"
                :class="{ active: rte.imageSidebarKey === 'uncategorized' }"
                title="只看还没归类的图片"
                @click="rte.imageSidebarKey = 'uncategorized'"
              >
                <span data-rte-own class="rte-image-side-ico" aria-hidden="true">📁</span>
                <span data-rte-own class="rte-image-side-label">未分类</span>
              </button>
              <button data-rte-own
                v-for="cat in rte.imageCategories"
                :key="cat.id"
                type="button"
                class="rte-image-side-item"
                :class="{ active: rte.imageSidebarKey === cat.id }"
                title="只看这个分类里的图片"
                @click="rte.imageSidebarKey = cat.id"
              >
                <span data-rte-own class="rte-image-side-ico" aria-hidden="true">📁</span>
                <span data-rte-own class="rte-image-side-label">{{ cat.name }}</span>
                <span data-rte-own
                  class="rte-library-cat-delete"
                  role="button"
                  tabindex="0"
                  title="删除这个分类，里面的图片回到未分类"
                  aria-label="删除这个分类"
                  @click.stop="rte.deleteImageCategory(cat.id)"
                  @keydown.enter.stop="rte.deleteImageCategory(cat.id)"
                  @keydown.space.stop.prevent="rte.deleteImageCategory(cat.id)"
                >×</span>
              </button>
              <div data-rte-own class="rte-image-side-spacer" />
              <div data-rte-own v-if="rte.addingCategory" class="rte-image-add-cat-form">
                <input data-rte-own
                  v-model="rte.newCategoryName"
                  type="text"
                  class="rte-image-add-cat-input"
                  placeholder="分类名称"
                  title="分类名称，最多 40 字，按 Enter 创建"
                  maxlength="40"
                  @keydown.enter.prevent="rte.confirmAddCategory"
                  @keydown.esc.prevent="rte.addingCategory = false"
                />
                <button data-rte-own type="button" class="rte-image-add-cat-ok" title="用这个名字建分类" @click="rte.confirmAddCategory">
                  确定
                </button>
              </div>
              <button data-rte-own
                v-else
                type="button"
                class="rte-image-side-item rte-image-add-cat"
                title="新建一个分类"
                @click="rte.startAddCategory"
              >
                <span data-rte-own class="rte-image-side-ico" aria-hidden="true">📁+</span>
                <span data-rte-own class="rte-image-side-label">添加分类</span>
              </button>
            </aside>

            <div data-rte-own class="rte-image-main">
              <div data-rte-own class="rte-image-main-top">
                <div data-rte-own class="rte-library-tools">
                  <button data-rte-own
                    type="button"
                    class="rte-library-delete"
                    title="从素材库删除选中的图片"
                    :disabled="rte.imageSelectedIds.size === 0"
                    @click="rte.deleteSelectedImages()"
                  >
                    删除
                  </button>
                  <span data-rte-own v-if="rte.imageSelectedIds.size" class="rte-library-count">
                    已选 {{ rte.imageSelectedIds.size }}
                  </span>
                </div>
                <label data-rte-own class="rte-image-select-all">
                  <input data-rte-own
                    type="checkbox"
                    :checked="rte.imageSelectAll"
                    title="选中或取消当前分类里的全部图片"
                    @change="rte.onImageSelectAllChange"
                  />
                  <span data-rte-own>本页全选</span>
                </label>
              </div>
              <div data-rte-own
                class="rte-image-grid"
                :class="{ empty: rte.filteredImageAssets.length === 0 }"
              >
                <button data-rte-own
                  type="button"
                  class="rte-image-upload-card"
                  title="从本机选图片，归到当前分类"
                  @click="rte.triggerLocalImagePick"
                >
                  <span data-rte-own class="rte-image-upload-ico" aria-hidden="true">
                    <svg data-rte-own width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <rect data-rte-own x="6" y="10" width="36" height="28" rx="4" stroke="#5b8cff" stroke-width="2"/>
                      <path data-rte-own d="M14 30l7-8 5 6 4-4 8 6" stroke="#5b8cff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <circle data-rte-own cx="18" cy="18" r="2.5" fill="#5b8cff"/>
                      <circle data-rte-own cx="36" cy="12" r="8" fill="#5b8cff"/>
                      <path data-rte-own d="M36 8v8M32 12h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                  </span>
                  <span data-rte-own class="rte-image-upload-label">本地图片上传</span>
                </button>
                <button data-rte-own
                  v-for="asset in rte.filteredImageAssets"
                  :key="asset.id"
                  type="button"
                  class="rte-image-thumb"
                  :class="{
                    selected: rte.imageSelectedIds.has(asset.id),
                    'is-loading': rte.imageThumb(asset.src).status === 'loading',
                    'is-error': rte.imageThumb(asset.src).status === 'error',
                  }"
                  :title="'点一下选中「' + asset.name + '」，再点取消'"
                  @click="rte.toggleImageSelect(asset.id)"
                >
                  <img
                    v-if="rte.imageThumb(asset.src).status === 'direct' || rte.imageThumb(asset.src).status === 'ready'"
                    data-rte-own
                    :src="rte.imageThumb(asset.src).url"
                    :alt="asset.name"
                    @error="rte.imageThumbFailed(asset.src)"
                  />
                  <span
                    v-else-if="rte.imageThumb(asset.src).status === 'error'"
                    data-rte-own
                    class="rte-image-thumb-error"
                  >
                    <span data-rte-own class="rte-image-thumb-error-text">
                      {{ rte.imageThumb(asset.src).error }}
                    </span>
                    <span
                      data-rte-own
                      class="rte-image-thumb-retry"
                      role="button"
                      tabindex="0"
                      title="重新加载这张缩略图"
                      @click.stop="rte.retryImageThumb(asset.src)"
                      @keydown.enter.stop="rte.retryImageThumb(asset.src)"
                      @keydown.space.stop.prevent="rte.retryImageThumb(asset.src)"
                    >重试</span>
                  </span>
                  <span
                    v-else
                    data-rte-own
                    class="rte-image-thumb-loading"
                    aria-live="polite"
                  >加载中…</span>
                  <span data-rte-own class="rte-library-card-name">{{ asset.name }}</span>
                  <span data-rte-own
                    class="rte-library-card-delete"
                    role="button"
                    tabindex="0"
                    title="从素材库删除这一张"
                    aria-label="从素材库删除这一张"
                    @click.stop="rte.deleteImageAsset(asset.id)"
                    @keydown.enter.stop="rte.deleteImageAsset(asset.id)"
                    @keydown.space.stop.prevent="rte.deleteImageAsset(asset.id)"
                  >×</span>
                  <span data-rte-own
                    class="rte-image-thumb-check"
                    :class="{ on: rte.imageSelectedIds.has(asset.id) }"
                  />
                </button>
              </div>
            </div>
          </div>

          <div data-rte-own v-else class="rte-image-external">
            <p data-rte-own class="rte-link-import-hint">每行一个图片 URL，支持一次插入多张。</p>
            <textarea data-rte-own
              v-model="rte.imageExternalUrls"
              class="rte-image-url-textarea"
              placeholder="https://example.com/a.png&#10;https://example.com/b.jpg"
              title="每行一个 http 或 https 图片地址"
              spellcheck="false"
            />
          </div>

          <div data-rte-own class="rte-modal-actions rte-image-actions">
            <button data-rte-own type="button" class="rte-modal-cancel" title="不插入图片" @click="rte.closeImageDialog">
              取消
            </button>
            <button data-rte-own type="button" class="rte-modal-confirm" title="把选中的图片插到光标处；外部链接则按每行一个插入" @click="rte.confirmInsertImages">
              确认
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 视频 / 音频共用同一选择窗，只换文案和插入节点 -->
    <RteAvPickDialog :picker="rte.videoPicker" />
    <RteAvPickDialog :picker="rte.audioPicker" />
</template>
