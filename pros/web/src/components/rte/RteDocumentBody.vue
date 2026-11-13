<script setup lang="ts">
import { inject } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import FormPropertyInspector from '../FormPropertyInspector.vue'
import CommentThreadPanel from './CommentThreadPanel.vue'
import RteAttachmentPreview from './RteAttachmentPreview.vue'
import RteQrDialog from './RteQrDialog.vue'
import RteImageLightbox from './RteImageLightbox.vue'
import RteSelectionBubble from './RteSelectionBubble.vue'
import RteSourceCodeEditor from './RteSourceCodeEditor.vue'
import RteTableFormulaBar from './RteTableFormulaBar.vue'
import { RTE_BINDINGS } from './bindings'
import { blockHandleTitle, cropTitle, emptyGuideTitle, imagePlaceTitle, imageWidthTitle, toolbarMenuItemTitle, wordStatTitle } from '../../utils/rteToolbarOptimize'
import { useParentScopeStamp } from './inheritScope'
import RteMenuGlyph from './RteMenuGlyph.vue'

const rte = inject(RTE_BINDINGS)
if (!rte) throw new Error('RteDocumentBody 必须放在 RichTextEditor 里')
const vRteFloat = rte.vRteFloat
useParentScopeStamp()
</script>

<template>
    <!-- 选区浮动工具条（字体 / 字号 / 加粗 / 颜色 / 高亮 / 清除格式 / 链接 / 对齐 …） -->
    <RteSelectionBubble />


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
          :title="'插入一条' + opt.label"
          @click="rte.insertHrVariant(opt.value)"
        >
          <RteMenuGlyph :id="opt.value" :label="opt.label" />
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
        <button data-rte-own type="button" title="选中光标所在的整段" @click="rte.selectCurrentBlock(); rte.blockOpsOpen = false"><RteMenuGlyph label="全选当前块" />全选当前块</button>
        <button data-rte-own type="button" title="在下面再复制一份" @click="rte.duplicateCurrentBlock(); rte.blockOpsOpen = false"><RteMenuGlyph label="复制当前块" />复制当前块</button>
        <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
        <button data-rte-own type="button" title="和上面一块交换位置" @click="rte.moveCurrentBlock(-1); rte.blockOpsOpen = false"><RteMenuGlyph label="上移一块" />上移一块</button>
        <button data-rte-own type="button" title="和下面一块交换位置" @click="rte.moveCurrentBlock(1); rte.blockOpsOpen = false"><RteMenuGlyph label="下移一块" />下移一块</button>
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
        <button data-rte-own type="button" title="插入今天的日期" @click="rte.insertPlainDate(); rte.insertDateOpen = false"><RteMenuGlyph label="今天日期" />今天日期</button>
        <button data-rte-own type="button" title="插入现在的日期和时间" @click="rte.insertPlainDateTime(); rte.insertDateOpen = false"><RteMenuGlyph label="现在时间" />现在时间</button>
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
          :title="imagePlaceTitle(opt.label) || ('排版：' + opt.label)"
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
          :title="imageWidthTitle(opt.label) || ('宽度：' + opt.label)"
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
          @blur="rte.applyImageCaption"
        />
        <button data-rte-own
          type="button"
          class="rte-bubble-btn"
          title="把输入的题注写到图片上。按 Enter 也可以"
          aria-label="应用图片说明"
          @mousedown.prevent
          @click="rte.applyImageCaption"
        >
          题注
        </button>
        <button data-rte-own type="button" class="rte-bubble-btn" title="删掉选中的这张图片" aria-label="删除图片" @mousedown.prevent @click="rte.deleteSelectedImage">
          删除
        </button>
        <button data-rte-own type="button" class="rte-bubble-btn" title="下载这张图片的原文件" aria-label="下载图片" @mousedown.prevent @click="rte.downloadSelectedImage">
          下载
        </button>
        <button data-rte-own type="button" class="rte-bubble-btn" title="打开大图，双击图片也可以" aria-label="查看大图" @mousedown.prevent @click="rte.openSelectedImage">
          大图
        </button>
        <button data-rte-own type="button" class="rte-bubble-btn" title="换成另一张图，保留裁剪和题注" aria-label="换图" @mousedown.prevent @click="rte.replaceImageByUrl()">
          换图
        </button>
        <span data-rte-own class="rte-image-replace-hint">拖到左右边缘插入该行，拖到图片中间替换</span>
      </div>
      <div data-rte-own class="rte-image-bubble-row">
        <span data-rte-own class="rte-image-width-label">裁剪</span>
        <button data-rte-own
          v-for="preset in rte.CROP_PRESETS"
          :key="'img-crop-' + preset.id"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: rte.imageCropPreset === preset.id }"
          :title="cropTitle(preset.label) || ('裁剪比例：' + preset.label)"
          :aria-pressed="rte.imageCropPreset === preset.id"
          @mousedown.prevent
          @click="rte.applyCropPreset(preset)"
        >
          {{ preset.label }}
        </button>
      </div>
      <div data-rte-own class="rte-image-bubble-row rte-image-caption-row">
        <input data-rte-own
          v-model="rte.imageAlt"
          class="rte-image-caption-input"
          type="text"
          maxlength="120"
          placeholder="替代文字（读屏与图片检索用）"
          @mousedown.stop
          @keydown.enter.prevent="rte.setImageAlt(rte.imageAlt)"
        />
        <button data-rte-own
          type="button"
          class="rte-bubble-btn"
          title="写上读屏和检索用的说明。按 Enter 也可以"
          aria-label="应用图片替代文字"
          @mousedown.prevent
          @click="rte.setImageAlt(rte.imageAlt)"
        >
          alt
        </button>
      </div>
      <div data-rte-own class="rte-image-bubble-row">
        <span data-rte-own class="rte-image-width-label">圆角</span>
        <button data-rte-own
          v-for="opt in rte.IMAGE_RADIUS_PRESETS"
          :key="'img-r-' + (opt.value || 'none')"
          type="button"
          class="rte-bubble-btn"
          :class="{ active: (rte.editor?.getAttributes('image')?.borderRadius || '') === opt.value }"
          :title="toolbarMenuItemTitle(opt.label) || undefined"
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
          :title="toolbarMenuItemTitle(opt.label) || undefined"
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
          :title="toolbarMenuItemTitle(opt.label) || undefined"
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
    <RteImageLightbox />
    <RteAttachmentPreview />
    <RteQrDialog />

    <div data-rte-own v-if="rte.suggesting && rte.viewMode === 'edit'" class="rte-suggest-bar" role="status">
      <span data-rte-own>建议模式</span>
      <span data-rte-own class="rte-suggest-author" :style="{ color: rte.suggestionColor(rte.rteAuthor().id) }">{{ rte.rteAuthor().name }}</span>
      <span data-rte-own class="rte-suggest-count">{{ rte.visibleSuggestionRanges.length }} 条修订</span>
      <select
        v-if="rte.suggestionAuthors.length > 1"
        data-rte-own
        class="rte-suggest-author"
        :value="rte.suggestionAuthorFilter"
        aria-label="只看一位作者的修订"
        @change="rte.suggestionAuthorFilter = ($event.target as HTMLSelectElement).value"
      >
        <option value="">全部作者</option>
        <option v-for="name in rte.suggestionAuthors" :key="name" :value="name">{{ name }}</option>
      </select>
      <button data-rte-own type="button" title="接受当前这一条修订" :disabled="!rte.activeSuggestionId" @click="rte.acceptActiveSuggestion">接受</button>
      <button data-rte-own type="button" title="拒绝当前这一条修订，恢复原文" :disabled="!rte.activeSuggestionId" @click="rte.rejectActiveSuggestion">拒绝</button>
      <button data-rte-own type="button" title="接受所有修订" :disabled="!rte.suggestionRanges.length" @click="rte.acceptAllSuggestions">全部接受</button>
      <button data-rte-own type="button" title="拒绝所有修订，全部恢复原文" :disabled="!rte.suggestionRanges.length" @click="rte.rejectAllSuggestions">全部拒绝</button>
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
        <button data-rte-own type="button" class="rte-preview-back" title="回到可以改字的编辑状态" @click="rte.setViewMode('edit')">
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
          title="文档标题，最多 100 字，不写进正文"
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
        <div data-rte-own v-if="rte.screenHeader" class="rte-page-header">{{ rte.screenHeader }}</div>
        <RteTableFormulaBar
          data-rte-own
          :editor="rte.editor"
          :readonly="rte.viewMode !== 'edit'"
        />
        <EditorContent data-rte-own
          :editor="rte.editor"
          class="rte-body"
          :style="{ zoom: rte.editorZoom }"
        />
        <div
          v-if="rte.watermark.enabled && rte.watermark.text"
          class="rte-doc-watermark"
          data-rte-own
          aria-hidden="true"
        >
          <span v-for="n in 18" :key="'wm-' + n" data-rte-own>{{ rte.watermark.text }}</span>
        </div>
        <div data-rte-own
          v-if="rte.screenFooter || rte.screenPageLabel"
          class="rte-page-footer"
          :class="{ 'is-num-only': !rte.screenFooter && rte.screenPageLabel }"
        >
          <span data-rte-own class="rte-page-footer-text">{{ rte.screenFooter }}</span>
          <span data-rte-own v-if="rte.screenPageLabel" class="rte-page-footer-num">{{ rte.screenPageLabel }}</span>
        </div>
        <div data-rte-own v-if="rte.screenHeader || rte.screenFooter || rte.screenPageLabel" class="rte-running-chrome" aria-hidden="true">
          <div data-rte-own class="rte-running-header">{{ rte.screenHeader }}</div>
          <div data-rte-own class="rte-running-footer">
            <span data-rte-own>{{ rte.screenFooter }}</span>
            <span data-rte-own class="rte-running-num" :data-style="rte.pageChrome.pageNumber"></span>
          </div>
        </div>
        <div data-rte-own
          v-if="rte.blockHandle.visible"
          class="rte-block-tools"
          :style="{ top: rte.blockHandle.top + 'px', left: rte.blockHandle.left + 'px' }"
          @mousedown.stop
          @click.stop
        >
          <button data-rte-own
            v-if="rte.expanded"
            type="button"
            class="rte-block-handle"
            draggable="true"
            title="拖动排序，点击打开块操作"
            aria-label="拖动调整块顺序"
            @click.stop="rte.onBlockGripClick"
            @dragstart="rte.onBlockDragStart"
            @dragend="rte.onBlockDragEnd"
          >
            <svg data-rte-own viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <circle data-rte-own cx="5.5" cy="3.5" r="1.15" fill="currentColor" />
              <circle data-rte-own cx="10.5" cy="3.5" r="1.15" fill="currentColor" />
              <circle data-rte-own cx="5.5" cy="8" r="1.15" fill="currentColor" />
              <circle data-rte-own cx="10.5" cy="8" r="1.15" fill="currentColor" />
              <circle data-rte-own cx="5.5" cy="12.5" r="1.15" fill="currentColor" />
              <circle data-rte-own cx="10.5" cy="12.5" r="1.15" fill="currentColor" />
            </svg>
          </button>
          <button data-rte-own
            type="button"
            class="rte-block-handle"
            :title="blockHandleTitle('menu')"
            :aria-label="blockHandleTitle('menu')"
            aria-haspopup="menu"
            :aria-expanded="rte.blockMenuOpen"
            @click.stop="rte.toggleBlockMenu"
          >
            <svg data-rte-own viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <circle data-rte-own cx="8" cy="3.5" r="1.25" fill="currentColor" />
              <circle data-rte-own cx="8" cy="8" r="1.25" fill="currentColor" />
              <circle data-rte-own cx="8" cy="12.5" r="1.25" fill="currentColor" />
            </svg>
          </button>
        </div>
        <div data-rte-own
          v-if="rte.blockMenuOpen"
          class="rte-block-menu"
          role="menu"
          aria-label="块操作"
          :style="{ top: rte.blockHandle.top + 26 + 'px', left: rte.blockHandle.left + 'px' }"
          @mousedown.stop
          @click.stop
          @keydown="rte.onBlockMenuKeydown"
        >
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('insert')" @click="rte.insertBelowHoveredBlock">在下方插入</button>
          <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('paragraph')" @click="rte.turnHoveredBlock('paragraph')">正文</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('h1')" @click="rte.turnHoveredBlock('h1')">标题 1</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('h2')" @click="rte.turnHoveredBlock('h2')">标题 2</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('h3')" @click="rte.turnHoveredBlock('h3')">标题 3</button>
          <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('bullet')" @click="rte.turnHoveredBlock('bullet')">无序列表</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('ordered')" @click="rte.turnHoveredBlock('ordered')">有序列表</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('task')" @click="rte.turnHoveredBlock('task')">任务列表</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('quote')" @click="rte.turnHoveredBlock('quote')">引用</button>
          <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('info')" @click="rte.turnHoveredBlock('info')">提示</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('warn')" @click="rte.turnHoveredBlock('warn')">警告</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('success')" @click="rte.turnHoveredBlock('success')">成功</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('error')" @click="rte.turnHoveredBlock('error')">错误</button>
          <div data-rte-own class="rte-menu-sep" aria-hidden="true" />
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('copy')" @click="rte.copyHoveredBlock">复制块</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('up')" @click="rte.moveHoveredBlock(-1)">上移</button>
          <button data-rte-own type="button" role="menuitem" :title="blockHandleTitle('down')" @click="rte.moveHoveredBlock(1)">下移</button>
          <button data-rte-own type="button" role="menuitem" class="is-danger" :title="blockHandleTitle('delete')" @click="rte.deleteHoveredBlock">删除</button>
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
          @click.stop
        >
          <label data-rte-own class="rte-code-chrome-lang">
            <span data-rte-own class="rte-sr-only">代码语言</span>
            <select data-rte-own
              :value="rte.currentCodeLanguage()"
              aria-label="代码语言"
              title="选择这段代码按哪种语法上色"
              @change="rte.setCodeLanguage(($event.target as HTMLSelectElement).value)"
            >
              <option data-rte-own v-for="opt in rte.CODE_LANG_OPTIONS" :key="'chrome-' + opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <button data-rte-own
            type="button"
            :class="{ 'is-on': rte.codeBlockFlag('lineNumbers') }"
            :aria-pressed="rte.codeBlockFlag('lineNumbers')"
            aria-label="在代码块左侧显示行号"
            title="在代码块左侧显示行号"
            @mousedown.prevent
            @click="rte.toggleCodeBlockFlag('lineNumbers')"
          >行号</button>
          <button data-rte-own
            type="button"
            :class="{ 'is-on': rte.codeBlockFlag('wordWrap') }"
            :aria-pressed="rte.codeBlockFlag('wordWrap')"
            aria-label="长行在代码块里自动换行"
            title="长行在代码块里自动换行"
            @mousedown.prevent
            @click="rte.toggleCodeBlockFlag('wordWrap')"
          >换行</button>
          <button data-rte-own type="button" aria-label="把这段代码复制到剪贴板" title="把这段代码复制到剪贴板" @click="rte.copyActiveCodeBlock">复制</button>
        </div>
        <div data-rte-own v-if="rte.showEmptyGuide" class="rte-empty-guide" @mousedown.stop>
          <span data-rte-own>空文档</span>
          <button data-rte-own type="button" :title="emptyGuideTitle('heading')" @click="rte.setHeading(1)">标题</button>
          <button data-rte-own type="button" :title="emptyGuideTitle('list')" @click="rte.toggleBulletList">列表</button>
          <button data-rte-own type="button" :title="emptyGuideTitle('task')" @click="rte.toggleTaskList">待办</button>
          <button data-rte-own type="button" :title="emptyGuideTitle('callout')" @click="rte.insertCallout('info')">提示</button>
          <button data-rte-own type="button" :title="emptyGuideTitle('code')" @click="rte.toggleCodeBlock">代码</button>
          <button data-rte-own type="button" :title="emptyGuideTitle('formula')" @click="rte.insertFormula">公式</button>
          <button data-rte-own type="button" :title="emptyGuideTitle('table')" @click="rte.openTableDialog">表格</button>
          <button data-rte-own type="button" :title="emptyGuideTitle('columns')" @click="rte.insertColumns(2)">双栏</button>
          <button data-rte-own type="button" :title="emptyGuideTitle('date')" @click="rte.insertDateChip('date')">日期</button>
          <span data-rte-own class="rte-empty-guide-hint">或输入 / 插入</span>
        </div>
      </div>

      <div data-rte-own v-if="rte.viewMode === 'source'" class="rte-source-pane">
        <RteSourceCodeEditor
          data-rte-own
          :model-value="rte.sourceHtml"
          @update:model-value="rte.setSourceHtml"
        />
      </div>

      <FormPropertyInspector data-rte-own
        v-if="rte.showFormInspector && rte.selectedFormType && rte.selectedFormAttrs"
        :type="rte.selectedFormType"
        :attrs="rte.selectedFormAttrs"
        @patch="rte.applySelectedFormPatch"
        @close="rte.closeFormInspector"
        @duplicate="rte.duplicateSelectedForm"
        @check="rte.checkFormFields"
        @mousedown="rte.onFormInspectorMouseDown"
        @mouseup="rte.onFormInspectorMouseUp"
        @mouseleave="rte.onFormInspectorMouseUp"
      />

      <CommentThreadPanel
        v-if="rte.commentsOpen && rte.viewMode === 'edit'"
        :threads="rte.shownThreads"
        :orphan-ids="rte.orphanIds"
        :unresolved-count="rte.unresolvedCount"
        :show-resolved="rte.showResolved"
        :orphans-only="rte.orphansOnly"
        :draft="rte.commentDraft"
        :reply-drafts="rte.replyDrafts"
        :active-thread-id="rte.activeThreadId"
        :author="rte.rteAuthor()"
        :editable="true"
        @close="rte.commentsOpen = false"
        @update:show-resolved="rte.showResolved = $event"
        @update:orphans-only="rte.orphansOnly = $event"
        @update:draft-body="rte.commentDraft && (rte.commentDraft.body = $event)"
        @update:reply="(id, value) => (rte.replyDrafts[id] = value)"
        @cancel-draft="rte.cancelDraft"
        @submit-draft="rte.submitDraft"
        @submit-reply="rte.submitReply"
        @toggle-resolved="rte.toggleResolved"
        @remove-message="rte.removeMessage"
        @reanchor="rte.reanchorThread"
        @jump="rte.jumpToThread"
      />
      <aside data-rte-own
        v-if="rte.notesOpen && rte.viewMode === 'edit'"
        class="rte-outline-panel"
        aria-label="批注"
      >
        <div data-rte-own class="rte-outline-head">
          <span data-rte-own class="rte-outline-title">批注</span>
          <button data-rte-own type="button" class="rte-outline-close" title="收起批注侧栏" aria-label="收起批注侧栏" @click="rte.notesOpen = false">×</button>
        </div>
        <p data-rte-own v-if="!rte.noteRows.length" class="rte-outline-empty">还没有批注。选中文字后用工具栏「注释」添加，内容会留在正文里。</p>
        <nav data-rte-own v-else class="rte-outline-list">
          <div data-rte-own v-for="(row, idx) in rte.noteRows" :key="row.from + '-' + idx" class="rte-note-row">
            <button data-rte-own type="button" class="rte-outline-item" title="滚到正文里的这条注释" @click="rte.jumpNote(row)">
              <span data-rte-own class="rte-note-type">{{ row.type }}</span>
              {{ row.text || row.note || '空批注' }}
            </button>
            <button data-rte-own type="button" class="rte-note-remove" title="删掉这条注释，正文留下来" aria-label="删掉这条注释" @click="rte.removeNote(row)">删除</button>
          </div>
        </nav>
      </aside>
      <aside data-rte-own
        v-if="rte.historyOpen && rte.viewMode === 'edit'"
        class="rte-outline-panel rte-revision-panel"
        aria-label="正文版本"
      >
        <div data-rte-own class="rte-outline-head">
          <span data-rte-own class="rte-outline-title">版本</span>
          <button data-rte-own type="button" class="rte-outline-close" title="收起版本侧栏" aria-label="收起版本侧栏" @click="rte.historyOpen = false">×</button>
        </div>
        <p data-rte-own class="rte-outline-empty">记在这篇画布里，刷新后还在。自动记录保留最近 15 次，命名版本保留 8 个。不是多人协作的历史。</p>
        <button data-rte-own type="button" class="rte-revision-name" title="给现在的正文起名，命名版本会优先保留" @click="rte.nameCurrentRevision()">命名当前版本</button>
        <p data-rte-own v-if="rte.revisionNote" class="rte-outline-empty">{{ rte.revisionNote }}</p>
        <p data-rte-own v-if="!rte.revisions.length" class="rte-outline-empty">还没有版本。继续编辑一会儿会自动记下，也可以现在命名。</p>
        <nav data-rte-own v-else class="rte-outline-list">
          <div data-rte-own
            v-for="rev in [...rte.revisions].reverse()"
            :key="rev.id"
            class="rte-revision-row"
          >
            <div data-rte-own class="rte-revision-main">
              <span data-rte-own class="rte-revision-label">{{ rev.label || '自动记录' }}</span>
              <span data-rte-own class="rte-revision-time">{{ rte.formatRevisionTime(rev.at) }}</span>
            </div>
            <button data-rte-own type="button" class="rte-revision-restore" title="先记下当前正文，再换成这一版" @click="rte.restoreRevision(rev.id)">恢复</button>
          </div>
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
            title="收起大纲侧栏"
            aria-label="收起大纲侧栏"
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
            v-for="(h, hidx) in rte.outlineHeadings"
            :key="h.id"
            type="button"
            class="rte-outline-item"
            :class="{ 'is-current': rte.activeOutlineIndex === rte.outlineHeadings.indexOf(h), 'is-empty': h.empty }"
            :data-level="h.level"
            :title="h.text + '（右键更多操作）'"
            :aria-current="rte.activeOutlineIndex === rte.outlineHeadings.indexOf(h) ? 'location' : undefined"
            @click="rte.jumpToOutlineHeading(h)"
            @contextmenu.prevent="rte.openOutlineMenu(hidx, $event)"
          >
            {{ h.text }}
          </button>
        </nav>
      </aside>
    </div>

    <div data-rte-own v-if="rte.wordCountDockOpen" class="rte-word-dock" role="dialog" aria-label="字数统计">
      <div data-rte-own class="rte-word-dock-row" :title="wordStatTitle('chars')"><span data-rte-own>字符</span><strong data-rte-own>{{ rte.charCount }}</strong></div>
      <div data-rte-own class="rte-word-dock-row" :title="wordStatTitle('words')"><span data-rte-own>词数</span><strong data-rte-own>{{ rte.wordCount }}</strong></div>
      <div data-rte-own class="rte-word-dock-row" :title="wordStatTitle('cn')"><span data-rte-own>中文</span><strong data-rte-own>{{ rte.wordParts.cn }}</strong></div>
      <div data-rte-own class="rte-word-dock-row" :title="wordStatTitle('ascii')"><span data-rte-own>英文词</span><strong data-rte-own>{{ rte.wordParts.en }}</strong></div>
      <div data-rte-own class="rte-word-dock-row" :title="wordStatTitle('images')"><span data-rte-own>图片</span><strong data-rte-own>{{ rte.wordParts.images }}</strong></div>
      <div data-rte-own class="rte-word-dock-row" :title="wordStatTitle('minutes')"><span data-rte-own>阅读</span><strong data-rte-own>约 {{ rte.readingMinutes }} 分钟</strong></div>
      <div data-rte-own class="rte-word-dock-row" :title="wordStatTitle('paragraphs')"><span data-rte-own>段落</span><strong data-rte-own>{{ rte.docExtraStats.paragraphs }}</strong></div>
      <div data-rte-own class="rte-word-dock-row" :title="wordStatTitle('headings')"><span data-rte-own>标题</span><strong data-rte-own>{{ rte.docExtraStats.headings }}</strong></div>
      <div data-rte-own class="rte-word-dock-row" :title="wordStatTitle('selectionChars')">
        <span data-rte-own>选区</span>
        <strong data-rte-own>{{ rte.selectionStats.hasSelection ? rte.selectionStats.chars : '—' }}</strong>
      </div>
      <button data-rte-own type="button" class="rte-word-dock-close" :title="wordStatTitle('close')" @click="rte.wordCountDockOpen = false">关闭</button>
    </div>

    <div data-rte-own v-if="rte.showBottomBar" class="rte-bottom">
      <div data-rte-own class="rte-bottom-left">
        <button data-rte-own
          v-if="rte.showPublishActions"
          type="button"
          class="rte-bottom-link"
          title="打开发布选项。这项还在准备中"
          @click="rte.onPublishSettings"
        >
          发布设置 ▾
        </button>
        <button data-rte-own
          type="button"
          class="rte-wordcount"
          :aria-expanded="rte.wordCountDockOpen"
          :title="wordStatTitle('dock')"
          @click="rte.toggleWordCountDock"
        >
          字数 {{ rte.charCount }} · 中 {{ rte.wordParts.cn }} · 英 {{ rte.wordParts.en }} · 图 {{ rte.wordParts.images }}
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
        <button
          v-if="rte.pageSheetEnabled"
          data-rte-own
          type="button"
          class="rte-bottom-link"
          title="页面大小、页边距、页眉页脚与页码"
          @click="rte.openPageSetup()"
        >
          页面设置
        </button>
        <label v-if="rte.pageSheetEnabled" data-rte-own class="rte-page-size-field">
          页面
          <select data-rte-own
            :value="rte.pageSize"
            aria-label="页面大小"
            title="纸张大小，预览和打印按这个排"
            :disabled="rte.viewMode !== 'edit'"
            @change="rte.setPageSize(($event.target as HTMLSelectElement).value)"
          >
            <option data-rte-own v-for="opt in rte.RTE_PAGE_SIZES" :key="'bb-' + opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label v-if="rte.pageSheetEnabled" data-rte-own class="rte-page-size-field">
          页边距
          <select data-rte-own
            :value="rte.pageMargin.preset"
            aria-label="页边距"
            title="页边距预设：常规、窄、适中、宽或无边距"
            :disabled="rte.viewMode !== 'edit'"
            @change="rte.setMarginPreset(($event.target as HTMLSelectElement).value)"
          >
            <option data-rte-own v-for="opt in rte.PAGE_MARGIN_PRESETS" :key="'mg-' + opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
            <option data-rte-own value="custom">自定义</option>
          </select>
        </label>
        <label v-if="rte.pageSheetEnabled" data-rte-own class="rte-page-size-field">
          页眉
          <input data-rte-own
            class="rte-page-chrome-input"
            :value="rte.pageChrome.header"
            maxlength="80"
            aria-label="页眉"
            title="印在每页顶部，最多 80 字"
            :disabled="rte.viewMode !== 'edit'"
            @change="rte.setPageHeader(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label v-if="rte.pageSheetEnabled" data-rte-own class="rte-page-size-field">
          偶数页眉
          <input data-rte-own
            class="rte-page-chrome-input"
            :value="rte.pageChrome.headerEven"
            maxlength="80"
            aria-label="偶数页页眉"
            title="偶数页单独的页眉，留空则跟奇数页一样"
            :disabled="rte.viewMode !== 'edit'"
            @change="rte.setPageHeaderEven(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label v-if="rte.pageSheetEnabled" data-rte-own class="rte-page-size-field">
          装订线
          <input data-rte-own
            class="rte-page-chrome-input"
            :value="rte.pageChrome.gutter"
            type="number"
            min="0"
            max="40"
            step="0.1"
            aria-label="装订线毫米"
            title="加在左边距上，0 到 40 毫米"
            :disabled="rte.viewMode !== 'edit'"
            @change="rte.setPageGutter(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label v-if="rte.pageSheetEnabled" data-rte-own class="rte-page-size-field">
          页脚
          <input data-rte-own
            class="rte-page-chrome-input"
            :value="rte.pageChrome.footer"
            maxlength="80"
            aria-label="页脚"
            title="印在每页底部，最多 80 字"
            :disabled="rte.viewMode !== 'edit'"
            @change="rte.setPageFooter(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label v-if="rte.pageSheetEnabled" data-rte-own class="rte-page-size-field">
          偶数页脚
          <input data-rte-own
            class="rte-page-chrome-input"
            :value="rte.pageChrome.footerEven"
            maxlength="80"
            aria-label="偶数页页脚"
            title="偶数页单独的页脚，留空则跟奇数页一样"
            :disabled="rte.viewMode !== 'edit'"
            @change="rte.setPageFooterEven(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label v-if="rte.pageSheetEnabled" data-rte-own class="rte-page-size-field">
          页码
          <select data-rte-own
            :value="rte.pageChrome.pageNumber"
            aria-label="页码"
            title="页码样式：1、第 1 页、第 1 页共 n 页，或 - 1 -"
            :disabled="rte.viewMode !== 'edit'"
            @change="rte.setPageNumber(($event.target as HTMLSelectElement).value)"
          >
            <option data-rte-own v-for="opt in rte.PAGE_NUMBER_OPTIONS" :key="'pn-' + opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <button data-rte-own type="button" class="rte-bottom-link" title="开始演示，按块或按屏翻页，Esc 退出" @click="rte.openPresent">演示</button>
        <span data-rte-own v-if="rte.pageSheetEnabled && rte.pageMargin.preset === 'custom'" class="rte-margin-custom">
          <label data-rte-own>上<input data-rte-own :value="rte.pageMargin.top" type="number" min="0" max="80" step="0.1" aria-label="上边距毫米" title="上边距，0 到 80 毫米" :disabled="rte.viewMode !== 'edit'" @change="rte.setMarginSide('top', ($event.target as HTMLInputElement).value)" /></label>
          <label data-rte-own>下<input data-rte-own :value="rte.pageMargin.bottom" type="number" min="0" max="80" step="0.1" aria-label="下边距毫米" title="下边距，0 到 80 毫米" :disabled="rte.viewMode !== 'edit'" @change="rte.setMarginSide('bottom', ($event.target as HTMLInputElement).value)" /></label>
          <label data-rte-own>左<input data-rte-own :value="rte.pageMargin.left" type="number" min="0" max="80" step="0.1" aria-label="左边距毫米" title="左边距，0 到 80 毫米" :disabled="rte.viewMode !== 'edit'" @change="rte.setMarginSide('left', ($event.target as HTMLInputElement).value)" /></label>
          <label data-rte-own>右<input data-rte-own :value="rte.pageMargin.right" type="number" min="0" max="80" step="0.1" aria-label="右边距毫米" title="右边距，0 到 80 毫米" :disabled="rte.viewMode !== 'edit'" @change="rte.setMarginSide('right', ($event.target as HTMLInputElement).value)" /></label>
        </span>
        <button data-rte-own
          v-if="rte.expanded && rte.viewMode === 'edit'"
          type="button"
          class="rte-bottom-link"
          :aria-pressed="rte.notesOpen"
          title="打开侧栏，看正文里的注释"
          @click="rte.notesOpen = !rte.notesOpen"
        >
          批注
        </button>
        <button data-rte-own
          v-if="rte.expanded && rte.viewMode === 'edit'"
          type="button"
          class="rte-bottom-link"
          :aria-pressed="rte.commentsOpen"
          title="打开评论栏，看还没解决的讨论"
          @click="rte.commentsOpen = !rte.commentsOpen"
        >
          评论<span data-rte-own v-if="rte.unresolvedCount"> {{ rte.unresolvedCount }}</span>
        </button>
        <button data-rte-own
          v-if="rte.expanded && rte.viewMode === 'edit'"
          type="button"
          class="rte-bottom-link"
          :aria-pressed="rte.historyOpen"
          title="正文版本记在这篇画布里，刷新后还在"
          @click="rte.historyOpen = !rte.historyOpen"
        >
          版本
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

    <!-- 只读预览里的评论浮层：跟随内容，列出未解决的讨论 -->
    <aside
      data-rte-own
      v-if="rte.viewMode === 'preview' && rte.shownThreads.length"
      class="rte-comment-float"
      aria-label="评论"
    >
      <div data-rte-own class="rte-comment-float-title">评论 · {{ rte.shownThreads.length }}</div>
      <button
        data-rte-own
        v-for="t in rte.shownThreads"
        :key="t.id"
        type="button"
        class="rte-comment-float-item"
        :title="t.quote || '评论'"
        @click="rte.jumpToThread(t.id)"
      >
        <span data-rte-own class="rte-comment-float-quote">{{ t.quote || '（没有摘录原文）' }}</span>
        <span data-rte-own class="rte-comment-float-meta">{{ t.messages.length }} 条</span>
      </button>
    </aside>

    <!-- 大纲右键菜单 -->
    <Teleport to="body">
      <div
        data-rte-own
        v-if="rte.outlineMenuOpen"
        class="rte-menu rte-float-menu rte-outline-menu"
        :style="rte.outlineMenuStyle"
        role="menu"
        aria-label="标题操作"
        @mousedown.prevent
        @contextmenu.prevent
      >
        <button data-rte-own type="button" role="menuitem" title="滚到这个标题，并闪一下" @click="rte.outlineMenuJump()">跳到这一节</button>
        <button data-rte-own type="button" role="menuitem" title="这一节连同下面的正文，和上一节对调" @click="rte.outlineMenuMove(-1)">上移整节</button>
        <button data-rte-own type="button" role="menuitem" title="这一节连同下面的正文，和下一节对调" @click="rte.outlineMenuMove(1)">下移整节</button>
        <button data-rte-own type="button" role="menuitem" title="这一节和下属标题都提高一级" @click="rte.outlineMenuCascade(-1)">整节升一级</button>
        <button data-rte-own type="button" role="menuitem" title="这一节和下属标题都降低一级" @click="rte.outlineMenuCascade(1)">整节降一级</button>
        <button data-rte-own type="button" role="menuitem" title="把这一节的标题复制到剪贴板" @click="rte.outlineMenuCopyTitle()">复制标题</button>
        <button data-rte-own type="button" role="menuitem" title="复制可以跳到这一节的链接" @click="rte.outlineMenuCopyLink()">复制标题链接</button>
      </div>
    </Teleport>

    <!-- 窄屏浮动条：手机上把常用操作放到屏幕底部，避免工具栏挤在一起 -->
    <div data-rte-own v-if="rte.viewMode === 'edit'" class="rte-mobile-bar" role="toolbar" aria-label="快捷操作">
      <button
        data-rte-own
        type="button"
        class="rte-mobile-btn"
        :class="{ active: rte.isActive('bold') }"
        aria-label="加粗"
        title="把选中文字加粗"
        @mousedown.prevent
        @click="rte.toggleBold"
      >
        B
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-mobile-btn"
        :class="{ active: rte.isActive('italic') }"
        aria-label="斜体"
        title="把选中文字变成斜体"
        @mousedown.prevent
        @click="rte.toggleItalic"
      >
        <i>I</i>
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-mobile-btn"
        :class="{ active: rte.isActive('bulletList') }"
        aria-label="列表"
        title="把这段改成无序列表"
        @mousedown.prevent
        @click="rte.toggleBulletList"
      >
        ☰
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-mobile-btn"
        :class="{ active: rte.isActive('link') }"
        aria-label="链接"
        title="给选中文字加链接"
        @mousedown.prevent
        @click="rte.insertLink"
      >
        🔗
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-mobile-btn"
        aria-label="提及"
        title="在光标处插入 @，再选人"
        @mousedown.prevent
        @click="rte.insertMentionFromToolbar"
      >
        @
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-mobile-btn"
        aria-label="评论"
        title="给选中的文字写评论"
        @mousedown.prevent
        @click="rte.beginComment"
      >
        评
      </button>
      <button
        data-rte-own
        type="button"
        class="rte-mobile-btn"
        aria-label="更多工具"
        title="打开更多工具"
        @mousedown.prevent
        @click="rte.openMoreMenu"
      >
        ⋯
      </button>
    </div>
</template>
