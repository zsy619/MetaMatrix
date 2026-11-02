<script setup lang="ts">
import { inject } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import FormPropertyInspector from '../FormPropertyInspector.vue'
import { RTE_BINDINGS } from './bindings'
import { useParentScopeStamp } from './inheritScope'

const rte = inject(RTE_BINDINGS)
if (!rte) throw new Error('RteDocumentBody 必须放在 RichTextEditor 里')
const vRteFloat = rte.vRteFloat
useParentScopeStamp()
</script>

<template>
    <BubbleMenu data-rte-own
      v-if="rte.editor"
      :editor="rte.editor"
      :should-show="rte.bubbleShouldShow"
      :options="{ placement: 'top', offset: 8 }"
      class="rte-bubble"
      role="toolbar"
      aria-label="选区格式"
    >
      <button data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('bold') }"
        title="加粗 (Ctrl/⌘+B)"
        aria-label="加粗"
        :aria-pressed="rte.isActive('bold')"
        @mousedown.prevent
        @click="rte.toggleBold"
      >
        <component data-rte-own :is="rte.toolIcon('bold')" class="rte-ep-icon" />
      </button>
      <button data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('italic') }"
        title="斜体 (Ctrl/⌘+I)"
        aria-label="斜体"
        :aria-pressed="rte.isActive('italic')"
        @mousedown.prevent
        @click="rte.toggleItalic"
      >
        <component data-rte-own :is="rte.toolIcon('italic')" class="rte-ep-icon" />
      </button>
      <button data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('underline') }"
        title="下划线 (Ctrl/⌘+U)"
        aria-label="下划线"
        :aria-pressed="rte.isActive('underline')"
        @mousedown.prevent
        @click="rte.toggleUnderline"
      >
        <component data-rte-own :is="rte.toolIcon('underline')" class="rte-ep-icon" />
      </button>
      <button data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('strike') }"
        title="删除线 (Ctrl/⌘+Shift+X)"
        aria-label="删除线"
        :aria-pressed="rte.isActive('strike')"
        @mousedown.prevent
        @click="rte.toggleStrike"
      >
        <component data-rte-own :is="rte.toolIcon('strike')" class="rte-ep-icon" />
      </button>
      <span data-rte-own class="rte-bubble-sep" aria-hidden="true" />
      <button data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('bulletList') }"
        title="无序列表"
        aria-label="无序列表"
        :aria-pressed="rte.isActive('bulletList')"
        @mousedown.prevent
        @click="rte.toggleBulletList"
      >
        <component data-rte-own :is="rte.toolIcon('list')" class="rte-ep-icon" />
      </button>
      <button data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('orderedList') }"
        title="有序列表"
        aria-label="有序列表"
        :aria-pressed="rte.isActive('orderedList')"
        @mousedown.prevent
        @click="rte.toggleOrderedList"
      >
        <component data-rte-own :is="rte.toolIcon('listOrdered')" class="rte-ep-icon" />
      </button>
      <button data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('taskList') }"
        title="任务列表"
        aria-label="任务列表"
        :aria-pressed="rte.isActive('taskList')"
        @mousedown.prevent
        @click="rte.toggleTaskList"
      >
        <component data-rte-own :is="rte.toolIcon('listTask')" class="rte-ep-icon" />
      </button>
      <button data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('blockquote') }"
        title="引用 (Ctrl/⌘+Shift+9)"
        aria-label="引用"
        :aria-pressed="rte.isActive('blockquote')"
        @mousedown.prevent
        @click="rte.toggleBlockquote"
      >
        <component data-rte-own :is="rte.toolIcon('quote')" class="rte-ep-icon" />
      </button>
      <span data-rte-own class="rte-bubble-sep" aria-hidden="true" />
      <span data-rte-own class="rte-bubble-slot">
        <button data-rte-own
          type="button"
          class="rte-bubble-btn"
          :class="{ active: rte.bubbleSwatch === 'text' || !!rte.currentTextColor() }"
          title="文字颜色"
          aria-label="文字颜色"
          :aria-expanded="rte.bubbleSwatch === 'text'"
          @mousedown.prevent
          @click="rte.bubbleSwatch = rte.bubbleSwatch === 'text' ? null : 'text'"
        >
          <span data-rte-own class="rte-bubble-a" :style="{ borderBottomColor: rte.currentTextColor() || 'currentColor' }">A</span>
        </button>
        <div data-rte-own v-if="rte.bubbleSwatch === 'text'" class="rte-bubble-swatches" role="listbox" aria-label="文字颜色" @mousedown.prevent>
          <button data-rte-own type="button" class="rte-bubble-swatch is-clear" title="默认" aria-label="默认文字颜色" @click="rte.applyTextColor(''); rte.bubbleSwatch = null">A</button>
          <button data-rte-own
            v-for="color in rte.FEISHU_TEXT_COLORS"
            :key="'bt-' + color"
            type="button"
            class="rte-bubble-swatch"
            :style="{ background: color }"
            :aria-label="color"
            :class="{ 'is-on': rte.currentTextColor() === color }"
            @click="rte.applyTextColor(color); rte.bubbleSwatch = null"
          />
        </div>
      </span>
      <span data-rte-own class="rte-bubble-slot">
        <button data-rte-own
          type="button"
          class="rte-bubble-btn"
          :class="{ active: rte.bubbleSwatch === 'highlight' || rte.isActive('highlight') }"
          title="高亮颜色"
          aria-label="高亮颜色"
          :aria-pressed="rte.isActive('highlight')"
          :aria-expanded="rte.bubbleSwatch === 'highlight'"
          @mousedown.prevent
          @click="rte.bubbleSwatch = rte.bubbleSwatch === 'highlight' ? null : 'highlight'"
        >
          <component data-rte-own :is="rte.toolIcon('highlight')" class="rte-ep-icon" />
        </button>
        <div data-rte-own v-if="rte.bubbleSwatch === 'highlight'" class="rte-bubble-swatches" role="listbox" aria-label="高亮颜色" @mousedown.prevent>
          <button data-rte-own type="button" class="rte-bubble-swatch is-clear" title="清除高亮" aria-label="清除高亮" @click="rte.applyHighlightColor(''); rte.bubbleSwatch = null">×</button>
          <button data-rte-own
            v-for="color in rte.FEISHU_HIGHLIGHT_COLORS"
            :key="'bh-' + color"
            type="button"
            class="rte-bubble-swatch"
            :style="{ background: color }"
            :aria-label="color"
            :class="{ 'is-on': rte.currentHighlightColor() === color }"
            @click="rte.applyHighlightColor(color); rte.bubbleSwatch = null"
          />
        </div>
      </span>
      <button data-rte-own
        type="button"
        class="rte-bubble-btn"
        :class="{ active: rte.isActive('link') }"
        :title="rte.isActive('link') ? '编辑链接 (Ctrl/⌘+K)' : '插入链接 (Ctrl/⌘+K)'"
        :aria-label="rte.isActive('link') ? '编辑链接' : '插入链接'"
        :aria-pressed="rte.isActive('link')"
        @mousedown.prevent
        @click="rte.insertLink"
      >
        <component data-rte-own :is="rte.toolIcon('link')" class="rte-ep-icon" />
      </button>
      <button data-rte-own
        v-if="rte.isActive('link')"
        type="button"
        class="rte-bubble-btn"
        title="打开链接"
        aria-label="打开链接"
        @mousedown.prevent
        @click="rte.openCurrentLink"
      >
        ↗
      </button>
      <button data-rte-own
        v-if="rte.isActive('link')"
        type="button"
        class="rte-bubble-btn"
        title="复制链接地址"
        aria-label="复制链接地址"
        @mousedown.prevent
        @click="rte.copyCurrentLinkUrl"
      >
        ⧉
      </button>
      <button data-rte-own
        v-if="rte.isActive('link')"
        type="button"
        class="rte-bubble-btn rte-bubble-btn-danger"
        title="取消链接"
        aria-label="取消链接"
        @mousedown.prevent
        @click="rte.unlinkSelection"
      >
        ✕
      </button>
    </BubbleMenu>


    <!-- 紧凑模式也可开：分割线 / 块操作 / 日期（锚点由 onMoreToolClick 或工具按钮设置） -->
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.hrOpen"
        class="rte-menu rte-float-menu"
        v-rte-float="'hr'"
        @mousedown.prevent
        @mouseenter="rte.onToolMenuEnter('hr')"
        @mouseleave="rte.onToolMenuLeave($event, 'hr', () => (rte.hrOpen = false))"
      >
        <div data-rte-own class="rte-menu-section-label">分割线 · 也可输入 ---</div>
        <button data-rte-own
          v-for="opt in rte.HR_VARIANT_OPTIONS"
          :key="'hr2-' + opt.value"
          type="button"
          class="rte-hr-option"
          @click="rte.insertHrVariant(opt.value)"
        >
          <span data-rte-own class="rte-hr-preview" :data-variant="opt.value" aria-hidden="true" />
          <span data-rte-own>{{ opt.label }}</span>
        </button>
      </div>
    </Teleport>
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.blockOpsOpen"
        class="rte-menu rte-float-menu"
        v-rte-float="'blockOps'"
        @mousedown.prevent
        @mouseenter="rte.onToolMenuEnter('blockOps')"
        @mouseleave="rte.onToolMenuLeave($event, 'blockOps', () => (rte.blockOpsOpen = false))"
      >
        <button data-rte-own type="button" @click="rte.selectCurrentBlock(); rte.blockOpsOpen = false">全选当前块</button>
        <button data-rte-own type="button" @click="rte.duplicateCurrentBlock(); rte.blockOpsOpen = false">复制当前块</button>
        <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
        <button data-rte-own type="button" @click="rte.moveCurrentBlock(-1); rte.blockOpsOpen = false">上移一块</button>
        <button data-rte-own type="button" @click="rte.moveCurrentBlock(1); rte.blockOpsOpen = false">下移一块</button>
      </div>
    </Teleport>
    <Teleport to="body">
      <div data-rte-own
        v-if="rte.insertDateOpen"
        class="rte-menu rte-float-menu"
        v-rte-float="'insertDate'"
        @mousedown.prevent
        @mouseenter="rte.onToolMenuEnter('insertDate')"
        @mouseleave="rte.onToolMenuLeave($event, 'insertDate', () => (rte.insertDateOpen = false))"
      >
        <button data-rte-own type="button" @click="rte.insertPlainDate(); rte.insertDateOpen = false">今天日期</button>
        <button data-rte-own type="button" @click="rte.insertPlainDateTime(); rte.insertDateOpen = false">现在时间</button>
      </div>
    </Teleport>

    <!-- 图片选中：对齐 + 题注 -->
    <BubbleMenu data-rte-own
      v-if="rte.editor"
      :editor="rte.editor"
      :should-show="rte.imageBubbleShouldShow"
      :options="{ placement: 'bottom', offset: 10 }"
      class="rte-bubble rte-image-bubble"
    >
      <div data-rte-own class="rte-image-bubble-row">
        <button data-rte-own
          v-for="opt in rte.IMAGE_LAYOUT_OPTIONS"
          :key="'img-al-' + opt.id"
          type="button"
          class="rte-bubble-btn"
          :class="{
            active:
              (rte.editor?.getAttributes('image')?.align || 'center') === opt.align &&
              (rte.editor?.getAttributes('image')?.layout || 'block') === opt.layout,
          }"
          :title="'排版：' + opt.label"
          :aria-label="'图片' + opt.label"
          :aria-pressed="
            (rte.editor?.getAttributes('image')?.align || 'center') === opt.align &&
            (rte.editor?.getAttributes('image')?.layout || 'block') === opt.layout
          "
          @mousedown.prevent
          @click="rte.setImagePlacement(opt)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div data-rte-own class="rte-image-bubble-row">
        <span data-rte-own class="rte-image-width-label">宽</span>
        <button data-rte-own
          v-for="opt in rte.IMAGE_WIDTH_PRESETS"
          :key="'img-w-' + (opt.value || 'auto')"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: (rte.editor?.getAttributes('image')?.displayWidth || '') === opt.value }"
          :title="'宽度：' + opt.label"
          @mousedown.prevent
          @click="rte.setImageDisplayWidth(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div data-rte-own class="rte-image-bubble-row rte-image-caption-row">
        <input data-rte-own
          v-model="rte.imageBubbleCaption"
          class="rte-image-caption-input"
          type="text"
          maxlength="120"
          placeholder="题注（写入图片标题）"
          @mousedown.stop
          @keydown.enter.prevent="rte.applyImageCaption"
        />
        <button data-rte-own
          type="button"
          class="rte-bubble-btn"
          title="应用题注"
          aria-label="应用图片说明"
          @mousedown.prevent
          @click="rte.applyImageCaption"
        >
          题注
        </button>
        <button data-rte-own type="button" class="rte-bubble-btn" title="删除图片" aria-label="删除图片" @mousedown.prevent @click="rte.deleteSelectedImage">
          删除
        </button>
        <button data-rte-own type="button" class="rte-bubble-btn" title="下载原图" aria-label="下载图片" @mousedown.prevent @click="rte.downloadSelectedImage">
          下载
        </button>
        <button data-rte-own type="button" class="rte-bubble-btn" title="查看大图" aria-label="查看大图" @mousedown.prevent @click="rte.openSelectedImage">
          大图
        </button>
        <span data-rte-own class="rte-image-replace-hint">拖到左右边缘插入该行，拖到图片中间替换</span>
      </div>
      <div data-rte-own class="rte-image-bubble-row">
        <span data-rte-own class="rte-image-width-label">圆角</span>
        <button data-rte-own
          v-for="opt in rte.IMAGE_RADIUS_PRESETS"
          :key="'img-r-' + (opt.value || 'none')"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: (rte.editor?.getAttributes('image')?.borderRadius || '') === opt.value }"
          @mousedown.prevent
          @click="rte.setImageBorderRadius(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div data-rte-own class="rte-image-bubble-row">
        <span data-rte-own class="rte-image-width-label">阴影</span>
        <button data-rte-own
          v-for="opt in rte.IMAGE_SHADOW_PRESETS"
          :key="'img-s-' + (opt.value || 'none')"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: (rte.editor?.getAttributes('image')?.boxShadow || '') === opt.value }"
          @mousedown.prevent
          @click="rte.setImageBoxShadow(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div data-rte-own class="rte-image-bubble-row">
        <span data-rte-own class="rte-image-width-label">边框</span>
        <button data-rte-own
          v-for="opt in rte.IMAGE_BORDER_PRESETS"
          :key="'img-b-' + (opt.value || 'none')"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: (rte.editor?.getAttributes('image')?.borderStyle || '') === opt.value }"
          @mousedown.prevent
          @click="rte.setImageBorderStyle(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div data-rte-own class="rte-image-bubble-row">
        <button data-rte-own
          type="button"
          class="rte-bubble-btn"
          :class="{ active: rte.imageCompressOnInsert }"
          title="本地上传时压缩图片"
          @mousedown.prevent
          @click="rte.imageCompressOnInsert = !rte.imageCompressOnInsert"
        >
          {{ rte.imageCompressOnInsert ? '插入压缩：开' : '插入压缩：关' }}
        </button>
      </div>
    </BubbleMenu>
    <div data-rte-own v-if="rte.imageLightboxSrc" class="rte-image-lightbox" role="dialog" aria-label="查看大图" @click="rte.imageLightboxSrc = ''">
      <img data-rte-own :src="rte.imageLightboxSrc" alt="" />
    </div>

    <div data-rte-own
      class="rte-workspace"
      :class="{
        'has-form-inspector': rte.showFormInspector,
        'has-outline': rte.outlineOpen && rte.viewMode === 'edit',
      }"
    >
      <div data-rte-own
        v-if="rte.viewMode === 'preview'"
        class="rte-preview-banner"
        role="status"
      >
        <span data-rte-own>{{ rte.charCount === 0 ? '只读预览 · 这篇文档还没有正文' : '只读预览中' }}</span>
        <button data-rte-own type="button" class="rte-preview-back" @click="rte.setViewMode('edit')">
          返回编辑
        </button>
      </div>
      <div data-rte-own
        v-show="rte.viewMode !== 'source'"
        class="rte-canvas"
        :class="{
          'is-preview': rte.viewMode === 'preview',
          'is-paper-guide': rte.paperGuide,
        }"
        @click="rte.onCanvasClick"
        @mousemove="rte.onCanvasBlockHover"
        @mouseleave="rte.hideBlockHandle"
        @dragover="rte.onCanvasBlockDragOver"
        @drop="rte.onCanvasBlockDrop"
        @scroll="rte.onCanvasScroll"
      >
        <input data-rte-own
          v-if="rte.showTitle && rte.viewMode === 'edit'"
          class="rte-title"
          type="text"
          maxlength="100"
          :value="rte.localTitle"
          placeholder="请输入标题（最多 100 个字）"
          @input="rte.onTitleInput"
          @click.stop
        />
        <div data-rte-own
          v-if="rte.showTitle && rte.viewMode === 'edit'"
          class="rte-title-sep"
        />
        <div data-rte-own
          v-if="rte.showTitle && rte.viewMode === 'preview' && rte.localTitle"
          class="rte-title rte-title-preview"
        >
          {{ rte.localTitle }}
        </div>
        <div data-rte-own
          v-if="rte.showTitle && rte.viewMode === 'preview' && rte.localTitle"
          class="rte-title-sep"
        />
        <EditorContent data-rte-own
          :editor="rte.editor"
          class="rte-body"
          :style="{ zoom: rte.editorZoom }"
        />
        <div data-rte-own
          v-if="rte.blockHandle.visible"
          class="rte-block-tools"
          :style="{ top: rte.blockHandle.top + 'px', left: rte.blockHandle.left + 'px' }"
          @mousedown.stop
        >
          <button data-rte-own
            v-if="rte.expanded"
            type="button"
            class="rte-block-handle"
            draggable="true"
            title="拖动调整块顺序"
            aria-label="拖动调整块顺序"
            @dragstart="rte.onBlockDragStart"
            @dragend="rte.onBlockDragEnd"
          >
            ⠿
          </button>
          <button data-rte-own
            type="button"
            class="rte-block-handle"
            title="块操作"
            aria-label="块操作"
            aria-haspopup="menu"
            :aria-expanded="rte.blockMenuOpen"
            @click.stop="rte.toggleBlockMenu"
          >
            ⋮
          </button>
        </div>
        <div data-rte-own
          v-if="rte.blockMenuOpen"
          class="rte-block-menu"
          role="menu"
          aria-label="块操作"
          :style="{ top: rte.blockHandle.top + 26 + 'px', left: rte.blockHandle.left + 'px' }"
          @mousedown.stop
          @keydown="rte.onBlockMenuKeydown"
        >
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('paragraph')">正文</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('h1')">标题 1</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('h2')">标题 2</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('h3')">标题 3</button>
          <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('bullet')">无序列表</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('ordered')">有序列表</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('task')">任务列表</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('quote')">引用</button>
          <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('info')">提示</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('warn')">警告</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('success')">成功</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.turnHoveredBlock('error')">错误</button>
          <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
          <button data-rte-own type="button" role="menuitem" @click="rte.copyHoveredBlock">复制块</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.moveHoveredBlock(-1)">上移</button>
          <button data-rte-own type="button" role="menuitem" @click="rte.moveHoveredBlock(1)">下移</button>
          <button data-rte-own type="button" role="menuitem" class="is-danger" @click="rte.deleteHoveredBlock">删除</button>
        </div>
        <div data-rte-own
          v-if="rte.blockDropLine != null"
          class="rte-block-drop"
          :style="{ top: rte.blockDropLine + 'px' }"
        />
        <div data-rte-own
          v-if="rte.codeChrome"
          class="rte-code-chrome"
          :style="{ top: rte.codeChrome.top + 'px', left: rte.codeChrome.left + 'px' }"
          @mousedown.stop
        >
          <label data-rte-own class="rte-code-chrome-lang">
            <span data-rte-own class="rte-sr-only">代码语言</span>
            <select data-rte-own
              :value="rte.currentCodeLanguage()"
              aria-label="代码语言"
              @change="rte.setCodeLanguage(($event.target as HTMLSelectElement).value)"
            >
              <option data-rte-own v-for="opt in rte.CODE_LANG_OPTIONS" :key="'chrome-' + opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <button data-rte-own type="button" aria-label="复制代码" @click="rte.copyActiveCodeBlock">复制</button>
        </div>
        <div data-rte-own v-if="rte.showEmptyGuide" class="rte-empty-guide" @mousedown.stop>
          <span data-rte-own>空文档</span>
          <button data-rte-own type="button" @click="rte.setHeading(1)">标题</button>
          <button data-rte-own type="button" @click="rte.toggleBulletList">列表</button>
          <button data-rte-own type="button" @click="rte.toggleTaskList">待办</button>
          <button data-rte-own type="button" @click="rte.insertCallout('info')">提示</button>
          <button data-rte-own type="button" @click="rte.toggleCodeBlock">代码</button>
          <button data-rte-own type="button" @click="rte.insertFormula">公式</button>
          <button data-rte-own type="button" @click="rte.openTableDialog">表格</button>
          <button data-rte-own type="button" @click="rte.insertColumns(2)">双栏</button>
          <button data-rte-own type="button" @click="rte.insertDateChip('date')">日期</button>
          <span data-rte-own class="rte-empty-guide-hint">或输入 / 插入</span>
        </div>
      </div>

      <div data-rte-own v-if="rte.viewMode === 'source'" class="rte-source-pane">
        <label data-rte-own class="rte-source-label" for="rte-source-editor">HTML 源码</label>
        <textarea data-rte-own
          id="rte-source-editor"
          class="rte-source-editor"
          spellcheck="false"
          :value="rte.sourceHtml"
          @input="rte.onSourceInput"
        />
      </div>

      <FormPropertyInspector data-rte-own
        v-if="rte.showFormInspector && rte.selectedFormType && rte.selectedFormAttrs"
        :type="rte.selectedFormType"
        :attrs="rte.selectedFormAttrs"
        @patch="rte.applySelectedFormPatch"
        @close="rte.closeFormInspector"
        @mousedown="rte.onFormInspectorMouseDown"
        @mouseup="rte.onFormInspectorMouseUp"
        @mouseleave="rte.onFormInspectorMouseUp"
      />

      <aside data-rte-own
        v-if="rte.notesOpen && rte.viewMode === 'edit'"
        class="rte-outline-panel"
        aria-label="批注"
      >
        <div data-rte-own class="rte-outline-head">
          <span data-rte-own class="rte-outline-title">批注</span>
          <button data-rte-own type="button" class="rte-outline-close" aria-label="关闭批注" @click="rte.notesOpen = false">×</button>
        </div>
        <p data-rte-own v-if="!rte.noteRows.length" class="rte-outline-empty">还没有批注。选中文字后用工具栏「注释」添加，内容会留在正文里。</p>
        <nav data-rte-own v-else class="rte-outline-list">
          <div data-rte-own v-for="(row, idx) in rte.noteRows" :key="row.from + '-' + idx" class="rte-note-row">
            <button data-rte-own type="button" class="rte-outline-item" @click="rte.jumpNote(row)">
              <span data-rte-own class="rte-note-type">{{ row.type }}</span>
              {{ row.text || row.note || '空批注' }}
            </button>
            <button data-rte-own type="button" class="rte-note-remove" aria-label="删除批注" @click="rte.removeNote(row)">删除</button>
          </div>
        </nav>
      </aside>
      <aside data-rte-own
        v-if="rte.historyOpen && rte.viewMode === 'edit'"
        class="rte-outline-panel"
        aria-label="本次会话记录"
      >
        <div data-rte-own class="rte-outline-head">
          <span data-rte-own class="rte-outline-title">本地记录</span>
          <button data-rte-own type="button" class="rte-outline-close" aria-label="关闭本地记录" @click="rte.historyOpen = false">×</button>
        </div>
        <p data-rte-own class="rte-outline-empty">只保留这次打开编辑器后的若干步，用来撤销大段改动。云端版本仍走原来的保存。</p>
        <p data-rte-own v-if="!rte.sessionSnaps.length" class="rte-outline-empty">还没有可恢复的记录。继续编辑一会儿会自动记下。</p>
        <nav data-rte-own v-else class="rte-outline-list">
          <button data-rte-own
            v-for="(snap, idx) in [...rte.sessionSnaps].reverse()"
            :key="snap.at"
            type="button"
            class="rte-outline-item"
            @click="rte.restoreSessionSnap(snap.html)"
          >
            第 {{ rte.sessionSnaps.length - idx }} 步
          </button>
        </nav>
      </aside>
      <aside data-rte-own
        v-if="rte.outlineOpen && rte.viewMode === 'edit'"
        class="rte-outline-panel"
        aria-label="标题大纲"
      >
        <div data-rte-own class="rte-outline-head">
          <span data-rte-own class="rte-outline-title">大纲</span>
          <button data-rte-own
            type="button"
            class="rte-outline-close"
            title="关闭大纲"
            aria-label="关闭大纲"
            @click="rte.closeOutlinePanel"
          >
            ×
          </button>
        </div>
        <div data-rte-own v-if="!rte.outlineHeadings.length" class="rte-outline-empty">
          暂无标题。输入「/」插入标题，或用工具栏「标题」。
        </div>
        <nav data-rte-own v-else class="rte-outline-list">
          <button data-rte-own
            v-for="h in rte.outlineHeadings"
            :key="h.id"
            type="button"
            class="rte-outline-item"
            :class="{ 'is-current': rte.activeOutlineIndex === rte.outlineHeadings.indexOf(h) }"
            :data-level="h.level"
            :title="h.text"
            :aria-current="rte.activeOutlineIndex === rte.outlineHeadings.indexOf(h) ? 'location' : undefined"
            @click="rte.jumpToOutlineHeading(h)"
          >
            {{ h.text }}
          </button>
        </nav>
      </aside>
    </div>

    <div data-rte-own v-if="rte.wordCountDockOpen" class="rte-word-dock" role="dialog" aria-label="字数统计">
      <div data-rte-own class="rte-word-dock-row"><span data-rte-own>字符</span><strong data-rte-own>{{ rte.charCount }}</strong></div>
      <div data-rte-own class="rte-word-dock-row"><span data-rte-own>词数</span><strong data-rte-own>{{ rte.wordCount }}</strong></div>
      <div data-rte-own class="rte-word-dock-row"><span data-rte-own>阅读</span><strong data-rte-own>约 {{ rte.readingMinutes }} 分钟</strong></div>
      <div data-rte-own class="rte-word-dock-row"><span data-rte-own>段落</span><strong data-rte-own>{{ rte.docExtraStats.paragraphs }}</strong></div>
      <div data-rte-own class="rte-word-dock-row"><span data-rte-own>标题</span><strong data-rte-own>{{ rte.docExtraStats.headings }}</strong></div>
      <div data-rte-own class="rte-word-dock-row">
        <span data-rte-own>选区</span>
        <strong data-rte-own>{{ rte.selectionStats.hasSelection ? rte.selectionStats.chars : '—' }}</strong>
      </div>
      <button data-rte-own type="button" class="rte-word-dock-close" @click="rte.wordCountDockOpen = false">关闭</button>
    </div>

    <div data-rte-own v-if="rte.showBottomBar" class="rte-bottom">
      <div data-rte-own class="rte-bottom-left">
        <button data-rte-own
          v-if="rte.showPublishActions"
          type="button"
          class="rte-bottom-link"
          @click="rte.onPublishSettings"
        >
          发布设置 ▾
        </button>
        <button data-rte-own
          type="button"
          class="rte-wordcount"
          :aria-expanded="rte.wordCountDockOpen"
          title="字数统计"
          @click="rte.toggleWordCountDock"
        >
          字数 {{ rte.charCount }}
          <template v-if="rte.selectionStats.hasSelection">
            · 选中 {{ rte.selectionStats.chars }}
          </template>
          · 约 {{ rte.readingMinutes }} 分钟
        </button>
        <span data-rte-own
          v-if="rte.showMarkdownHint"
          class="rte-md-hint"
          title="Ctrl/⌘+B 加粗，Ctrl/⌘+K 链接，/ 插入段落。完整列表见工具栏「快捷键」。"
        >
          / 插入 · ⌘/Ctrl+K 链接
        </span>
      </div>
      <div data-rte-own class="rte-bottom-right">
        <label data-rte-own class="rte-page-size-field">
          页面
          <select data-rte-own
            :value="rte.pageSize"
            aria-label="页面大小"
            :disabled="rte.viewMode !== 'edit'"
            @change="rte.setPageSize(($event.target as HTMLSelectElement).value)"
          >
            <option data-rte-own v-for="opt in rte.RTE_PAGE_SIZES" :key="'bb-' + opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label data-rte-own class="rte-page-size-field">
          页边距
          <select data-rte-own
            :value="rte.pageMargin.preset"
            aria-label="页边距"
            :disabled="rte.viewMode !== 'edit'"
            @change="rte.setMarginPreset(($event.target as HTMLSelectElement).value)"
          >
            <option data-rte-own v-for="opt in rte.PAGE_MARGIN_PRESETS" :key="'mg-' + opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
            <option data-rte-own value="custom">自定义</option>
          </select>
        </label>
        <span data-rte-own v-if="rte.pageMargin.preset === 'custom'" class="rte-margin-custom">
          <label data-rte-own>上<input data-rte-own :value="rte.pageMargin.top" type="number" min="0" max="80" step="0.1" aria-label="上边距毫米" :disabled="rte.viewMode !== 'edit'" @change="rte.setMarginSide('top', ($event.target as HTMLInputElement).value)" /></label>
          <label data-rte-own>下<input data-rte-own :value="rte.pageMargin.bottom" type="number" min="0" max="80" step="0.1" aria-label="下边距毫米" :disabled="rte.viewMode !== 'edit'" @change="rte.setMarginSide('bottom', ($event.target as HTMLInputElement).value)" /></label>
          <label data-rte-own>左<input data-rte-own :value="rte.pageMargin.left" type="number" min="0" max="80" step="0.1" aria-label="左边距毫米" :disabled="rte.viewMode !== 'edit'" @change="rte.setMarginSide('left', ($event.target as HTMLInputElement).value)" /></label>
          <label data-rte-own>右<input data-rte-own :value="rte.pageMargin.right" type="number" min="0" max="80" step="0.1" aria-label="右边距毫米" :disabled="rte.viewMode !== 'edit'" @change="rte.setMarginSide('right', ($event.target as HTMLInputElement).value)" /></label>
        </span>
        <button data-rte-own
          v-if="rte.expanded && rte.viewMode === 'edit'"
          type="button"
          class="rte-bottom-link"
          :aria-pressed="rte.notesOpen"
          @click="rte.notesOpen = !rte.notesOpen"
        >
          批注
        </button>
        <button data-rte-own
          v-if="rte.expanded && rte.viewMode === 'edit'"
          type="button"
          class="rte-bottom-link"
          :aria-pressed="rte.historyOpen"
          title="本次编辑会话里的本地记录，不是云端版本"
          @click="rte.historyOpen = !rte.historyOpen"
        >
          本地记录
        </button>
        <button data-rte-own
          v-if="rte.expanded"
          type="button"
          class="rte-bottom-link"
          :title="rte.viewMode === 'preview' ? '返回编辑（Ctrl/⌘+Alt+\\）' : '只读预览（Ctrl/⌘+Alt+\\）'"
          @click="rte.setViewMode(rte.togglePreviewMode(rte.viewMode))"
        >
          {{ rte.viewMode === 'preview' ? '返回编辑' : '预览' }}
        </button>
        <button data-rte-own
          v-if="rte.expanded"
          type="button"
          class="rte-bottom-link"
          title="复制为可粘贴到飞书的 HTML"
          @click="rte.copyAsFeishuHtml"
        >
          复制 HTML
        </button>
        <button data-rte-own
          v-if="rte.expanded"
          type="button"
          class="rte-bottom-link"
          title="导出当前面板 Markdown (Ctrl/⌘+Alt+E)"
          @click="rte.exportAsMarkdown"
        >
          导出 Markdown
        </button>
        <button data-rte-own
          v-if="rte.expanded"
          type="button"
          class="rte-bottom-link"
          title="打印预览 (Ctrl/⌘+Alt+P)"
          @click="rte.openPrintPreview"
        >
          打印
        </button>
        <span data-rte-own class="rte-draft" :class="rte.syncTone" role="status" :title="rte.syncHint">{{ rte.syncLabel }}</span>
        <template v-if="rte.showPublishActions">
          <button data-rte-own type="button" class="rte-preview" @click="rte.onPreview">
            预览
          </button>
          <button data-rte-own type="button" class="rte-publish" @click="rte.onPublish">
            发布
          </button>
        </template>
      </div>
    </div>
</template>
