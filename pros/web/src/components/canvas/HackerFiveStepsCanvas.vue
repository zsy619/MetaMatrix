<script setup lang="ts">
/**
 * 调用黑客五部曲画布。
 *
 * 按参考图重排为四列五步表：步骤 / 关键工作 / 依次回答 / 真正难点。
 * 「依次回答」列用全应用通一的富文本块（YModelBlockCard）：富文本、放大编辑、
 * 附件、一键整理、斜条命令、表格图表全部具备，写完的步数走顶部进度条。
 */
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import YModelBlockCard from './YModelBlock.vue'
import type {
  HackerFiveStep,
  HackerFiveStepBlock,
  HackerFiveStepsDocumentJSON,
} from '../../types/canvas'
import { isHackerFiveStepsDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'

const props = defineProps<{ doc: HackerFiveStepsDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

const steps = computed(() =>
  [...props.doc.steps].sort((a, b) => a.index - b.index),
)

const blocksById = computed(
  () => new Map(props.doc.blocks.map((b) => [b.id, b] as const)),
)

/** 每步对应的内容块；数据被改坏时跳过，不让整张表拆掉 */
function blockOf(step: HackerFiveStep): HackerFiveStepBlock | null {
  return blocksById.value.get(step.blockId) ?? null
}

const doneCount = computed(
  () =>
    steps.value.filter((step) => {
      const block = blockOf(step)
      return !!block && block.items.some((item) => item.text.trim().length > 0)
    }).length,
)

const progress = computed(() =>
  steps.value.length
    ? Math.round((doneCount.value / steps.value.length) * 100)
    : 0,
)

const hasAnswers = computed(() => doneCount.value > 0)

function resetAnswers() {
  documentStore.mutateCanvas((doc) => {
    if (!isHackerFiveStepsDoc(doc)) return
    for (const block of doc.blocks) block.items = []
  })
}
</script>

<template>
  <div class="hfs-canvas" :style="chrome" aria-label="调用黑客五部曲画布">
    <div class="hfs-inner">
      <header class="hfs-title-bar">
        <div class="hfs-title-main">
          <h1>{{ doc.title }}</h1>
          <p class="hfs-title-hint">五步把外部情报变成自己的判断，按顺序回答每一步的问题</p>
        </div>
        <div class="hfs-tools">
          <button
            type="button"
            class="hfs-btn"
            :disabled="!hasAnswers"
            @click="resetAnswers"
          >
            清空答案
          </button>
          <div class="hfs-progress">
            <div class="hfs-progress-text">
              已完成 <strong>{{ doneCount }}</strong> / {{ steps.length }}
            </div>
            <div
              class="hfs-progress-bar"
              role="progressbar"
              :aria-valuenow="progress"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="`已完成 ${doneCount} 步`"
            >
              <span class="hfs-progress-fill" :style="{ width: `${progress}%` }" />
            </div>
          </div>
        </div>
      </header>

      <div class="hfs-card">
        <div class="hfs-head" role="row">
          <div class="hfs-cell hfs-cell--index">步骤</div>
          <div class="hfs-cell hfs-cell--work">关键工作</div>
          <div class="hfs-cell hfs-cell--answer">依次回答</div>
          <div class="hfs-cell hfs-cell--diff">真正难点</div>
        </div>

        <div v-for="step in steps" :key="step.id" class="hfs-row">
          <div class="hfs-cell hfs-cell--index" data-label="步骤">
            <span class="hfs-badge">{{ step.index }}</span>
          </div>
          <div class="hfs-cell hfs-cell--work" data-label="关键工作">
            <span class="hfs-work">{{ step.work }}</span>
          </div>
          <div class="hfs-cell hfs-cell--answer" data-label="依次回答">
            <p class="hfs-question">{{ step.question }}</p>
            <div class="hfs-answer">
              <YModelBlockCard
                v-if="blockOf(step)"
                :block="blockOf(step)!"
                hide-title
              />
            </div>
          </div>
          <div class="hfs-cell hfs-cell--diff" data-label="真正难点">
            <span class="hfs-diff">{{ step.difficulty }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hfs-canvas {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: flex;
  min-height: 0;
  /* 上下 padding 对称，让内容在视口里真正上下左右完全对称 */
  padding: 14px;
  overflow: auto;
  color: #202124;
  background: var(--cv-page, #f4f0e8);
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
}

/*
 * 上下左右居中：用 margin:auto 而不是 justify-content/align-items——
 * 内容比视口高时 auto 外边距会退化成 0，顶部不会被裁掉
 * （flex 居中把溢出内容切掉的经典坑）。
 */
.hfs-inner {
  margin: auto;
  width: 100%;
  max-width: 1180px;
  display: flex;
  flex-direction: column;
}

.hfs-title-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 18px;
  padding: 0 4px 10px;
}

.hfs-title-main {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.hfs-title-bar h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.hfs-title-hint {
  margin: 0;
  font-size: 12px;
  color: var(--cv-muted, #5f6368);
}

.hfs-tools {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hfs-btn {
  padding: 6px 12px;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 8px;
  background: #fff;
  color: #3c4043;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.hfs-btn:hover:not(:disabled) {
  background: var(--cv-hover-wash, #e8f1fa);
  border-color: var(--cv-focus, #1c4c7c);
}

.hfs-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.hfs-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hfs-progress-text {
  font-size: 13px;
  color: var(--cv-muted, #5f6368);
  white-space: nowrap;
}

.hfs-progress-text strong {
  color: #e8823c;
  font-size: 15px;
}

.hfs-progress-bar {
  width: 120px;
  height: 6px;
  border-radius: 3px;
  background: rgba(60, 50, 20, 0.1);
  overflow: hidden;
}

.hfs-progress-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: #e8823c;
  transition: width 0.25s ease;
}

/* ---------------- 表格 ---------------- */
.hfs-card {
  flex: none;
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(60, 50, 20, 0.08);
  overflow: hidden;
}

.hfs-head,
.hfs-row {
  display: grid;
  grid-template-columns: 84px minmax(200px, 1fr) minmax(300px, 1.5fr) minmax(160px, 0.8fr);
}

.hfs-head {
  background: #fdf3e8;
  border-bottom: 1px solid #f4e0cb;
}

.hfs-head .hfs-cell {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 800;
  color: #e8823c;
  letter-spacing: 0.04em;
}

.hfs-row + .hfs-row {
  border-top: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.hfs-row:hover {
  background: #fffdfa;
}

.hfs-cell {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  min-width: 0;
}

.hfs-cell + .hfs-cell {
  border-left: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
}

.hfs-cell--index {
  justify-content: center;
}

.hfs-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #e8823c;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
}

.hfs-work {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.5;
}

.hfs-cell--answer {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.hfs-question {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--cv-muted, #5f6368);
}

/* 容器样式的富文本块：去掉自己的边框，边线由表格单元格给 */
.hfs-answer {
  position: relative;
  border-radius: 8px;
  background: #fcfbfa;
}

.hfs-answer :deep(.ym-block) {
  border: none;
  border-radius: 8px;
  background: transparent;
}

/* 空块默认占 132px（大面板用），表格单元格里要压掉，否则五行撑住页面 */
.hfs-answer :deep(.ym-block.empty:not(.compact)) {
  min-height: 0;
}

/* 「放大编辑」按钮贴在右上角，不单独占一行，五个作答区才敢放在一屏里 */
.hfs-answer :deep(.ym-block-toolbar) {
  position: absolute;
  top: 1px;
  right: 2px;
  z-index: 3;
  padding: 0;
}

.hfs-answer :deep(.ym-block-body) {
  padding: 0;
}

.hfs-answer :deep(.ym-block-body .rte-root) {
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

/* 单元格里的编辑器要压掉 A4 页边距（默认 12.7mm）和 50px 块手柄留白，否则文字需要从第二个字才开始 */
.hfs-answer :deep(.ym-block-body .rte-root.compact) {
  --rte-margin-top: 0px !important;
  --rte-margin-bottom: 0px !important;
}

.hfs-answer :deep(.ym-block-body .rte-root.compact .rte-canvas) {
  /* 单元格里只给两行行高；写长了内部滚动，要大窗去点右上角「放大编辑」 */
  height: 48px;
  min-height: 0;
  padding: 2px 30px 2px 4px;
}

.hfs-answer :deep(.ym-block-body .rte-root .rte-body) {
  min-height: 0;
}

.hfs-answer :deep(.ym-block-body .rte-root .rte-workspace) {
  min-height: 0;
}

.hfs-answer :deep(.ym-block-body .ProseMirror) {
  min-height: 36px;
  font-size: 13px;
  line-height: 1.65;
}

.hfs-diff {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 999px;
  background: #fdf3e8;
  color: #b35c12;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

/* ---------------- 响应式 ---------------- */
@media (max-width: 900px) {
  .hfs-title-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .hfs-tools {
    justify-content: space-between;
  }

  .hfs-head {
    display: none;
  }

  .hfs-row {
    grid-template-columns: 1fr;
  }

  .hfs-cell + .hfs-cell {
    border-left: none;
    border-top: 1px solid var(--cv-hairline, rgba(60, 50, 20, 0.08));
  }

  .hfs-cell--index {
    justify-content: flex-start;
  }

  /* 单列堆叠后表头行隐了，用小标签补回列名 */
  .hfs-row .hfs-cell {
    flex-direction: column;
    align-items: flex-start;
  }

  .hfs-row .hfs-cell::before {
    content: attr(data-label);
    margin-bottom: 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #e8823c;
  }
}
</style>
