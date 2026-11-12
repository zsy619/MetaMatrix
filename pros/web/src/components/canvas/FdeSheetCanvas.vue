<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type {
  FdeBlock,
  FdeRoiScenario,
  FdeSheetDocumentJSON,
} from '../../types/canvas'
import { isFdeSheetDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import RichTextEditor from '../RichTextEditor.vue'
import { itemTextToHtml, normalizeHtmlForCompare } from '../../utils/itemsHtml'

const props = defineProps<{ doc: FdeSheetDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

function patch(mutator: (doc: FdeSheetDocumentJSON) => void) {
  documentStore.mutateCanvas((doc) => {
    if (!isFdeSheetDoc(doc)) return
    mutator(doc)
  })
}

function block(id: string): FdeBlock | undefined {
  return props.doc.blocks.find((item) => item.id === id)
}

function writeRich(id: string, html: string) {
  const current = block(id)
  if (!current || current.kind !== 'rich') return
  if (normalizeHtmlForCompare(itemTextToHtml(current.html)) === normalizeHtmlForCompare(html)) return
  patch((doc) => {
    const item = doc.blocks.find((entry) => entry.id === id)
    if (item && item.kind === 'rich') item.html = html
  })
}

function toggleCheck(blockId: string, itemId: string) {
  patch((doc) => {
    const item = doc.blocks.find((entry) => entry.id === blockId)
    if (!item || item.kind !== 'checks') return
    const row = item.items.find((entry) => entry.id === itemId)
    if (row) row.checked = !row.checked
  })
}

function writeCheckNote(blockId: string, itemId: string, note: string) {
  patch((doc) => {
    const item = doc.blocks.find((entry) => entry.id === blockId)
    if (!item || item.kind !== 'checks') return
    const row = item.items.find((entry) => entry.id === itemId)
    if (row && row.note !== note) row.note = note
  })
}

function setScore(blockId: string, itemId: string, score: number) {
  patch((doc) => {
    const item = doc.blocks.find((entry) => entry.id === blockId)
    if (!item || item.kind !== 'score') return
    const row = item.items.find((entry) => entry.id === itemId)
    if (!row) return
    const next = Math.min(row.max, Math.max(0, Math.round(score)))
    if (row.score !== next) row.score = next
  })
}

function writeScoreNote(blockId: string, itemId: string, note: string) {
  patch((doc) => {
    const item = doc.blocks.find((entry) => entry.id === blockId)
    if (!item || item.kind !== 'score') return
    const row = item.items.find((entry) => entry.id === itemId)
    if (row && row.note !== note) row.note = note
  })
}

function writeCell(blockId: string, rowId: string, colId: string, value: string) {
  patch((doc) => {
    const item = doc.blocks.find((entry) => entry.id === blockId)
    if (!item || item.kind !== 'table') return
    const row = item.rows.find((entry) => entry.id === rowId)
    if (row && row.cells[colId] !== value) row.cells[colId] = value
  })
}

function addRow(blockId: string) {
  patch((doc) => {
    const item = doc.blocks.find((entry) => entry.id === blockId)
    if (!item || item.kind !== 'table') return
    const cells: Record<string, string> = {}
    for (const col of item.columns) cells[col.id] = ''
    item.rows.push({ id: `${blockId}_${Date.now().toString(36)}`, cells })
  })
}

function writeCard(blockId: string, cardId: string, note: string) {
  patch((doc) => {
    const item = doc.blocks.find((entry) => entry.id === blockId)
    if (!item || item.kind !== 'cards') return
    const card = item.cards.find((entry) => entry.id === cardId)
    if (card && card.note !== note) card.note = note
  })
}

function toggleCard(blockId: string, cardId: string) {
  patch((doc) => {
    const item = doc.blocks.find((entry) => entry.id === blockId)
    if (!item || item.kind !== 'cards') return
    const card = item.cards.find((entry) => entry.id === cardId)
    if (card) card.chosen = !card.chosen
  })
}

function writeRoi(blockId: string, scenarioId: string, key: keyof FdeRoiScenario, raw: string) {
  patch((doc) => {
    const item = doc.blocks.find((entry) => entry.id === blockId)
    if (!item || item.kind !== 'roi') return
    const scenario = item.scenarios.find((entry) => entry.id === scenarioId)
    if (!scenario || key === 'id' || key === 'name') return
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    scenario[key] = value
  })
}

function roiOf(scenario: FdeRoiScenario) {
  const savedMin = Math.max(0, scenario.beforeMin - scenario.afterMin)
  const adoption = Math.min(1, Math.max(0, scenario.adoption))
  const hours = (scenario.tasks * savedMin) / 60 * adoption
  const gross = hours * scenario.wage
  const net = gross - scenario.monthlyCost
  const year = net * 12 - scenario.upfront
  const payback = net > 0 ? scenario.upfront / net : null
  return { hours, gross, net, year, payback }
}

function money(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}¥${Math.abs(Math.round(value)).toLocaleString('zh-CN')}`
}

const selfItems = computed(() =>
  props.doc.blocks.flatMap((item) => (item.kind === 'score' ? item.items : [])),
)
const selfTotal = computed(() => selfItems.value.reduce((sum, item) => sum + item.score, 0))
const selfMax = computed(() => selfItems.value.reduce((sum, item) => sum + item.max, 0))
const selfLevel = computed(() => {
  const score = selfTotal.value
  if (score <= 8) return 'L0：AI 工具使用者'
  if (score <= 16) return 'L1：AI 工作流构建者'
  if (score <= 26) return 'L2：FDE 实践者'
  if (score <= 35) return 'L3：FDE 工程师'
  return 'L4：FDE Lead'
})
const weakest = computed(() => {
  const groups = props.doc.blocks.filter((item) => item.kind === 'score')
  if (!groups.length) return ''
  const ranked = groups
    .map((group) => ({
      title: group.title,
      score: group.items.reduce((sum, item) => sum + item.score, 0),
      max: group.items.reduce((sum, item) => sum + item.max, 0),
    }))
    .sort((a, b) => a.score / a.max - b.score / b.max)
  return ranked[0]?.title ?? ''
})
</script>

<template>
  <div class="sheet fde-sheet" :style="chrome" :aria-label="doc.title">
    <header class="top">
      <div>
        <p class="kicker">{{ doc.kicker }}</p>
        <h2>{{ doc.title }}</h2>
        <p class="lede">{{ doc.lede }}</p>
      </div>
      <p v-if="doc.compute === 'self'" class="score">
        <strong>{{ selfTotal }}</strong> / {{ selfMax }}
        <span>{{ selfLevel }}</span>
      </p>
    </header>
    <p v-if="doc.compute === 'self' && weakest" class="weak">最弱的一项：{{ weakest }}。上限由它决定。</p>

    <section v-for="item in doc.blocks" :key="item.id" class="block" :data-block="item.id">
      <header>
        <h3>{{ item.title }}</h3>
        <p v-if="item.hint">{{ item.hint }}</p>
      </header>

      <RichTextEditor
        v-if="item.kind === 'rich'"
        compact
        :page-sheet="false"
        :expanded="false"
        :show-title="false"
        :show-bottom-bar="false"
        :show-publish-actions="false"
        :show-markdown-hint="false"
        :aria-label="item.title"
        placeholder="点击填写…"
        :model-value="itemTextToHtml(item.html)"
        @update:model-value="writeRich(item.id, $event)"
      />

      <ul v-else-if="item.kind === 'checks'" class="checks">
        <li v-for="row in item.items" :key="row.id">
          <label>
            <input type="checkbox" :checked="row.checked" @change="toggleCheck(item.id, row.id)" />
            <span>{{ row.label }}</span>
          </label>
          <input
            class="note"
            :value="row.note"
            placeholder="证据或备注"
            :aria-label="`${row.label}的备注`"
            @change="writeCheckNote(item.id, row.id, ($event.target as HTMLInputElement).value)"
          />
        </li>
      </ul>

      <ul v-else-if="item.kind === 'score'" class="scores">
        <li v-for="row in item.items" :key="row.id">
          <div>
            <strong>{{ row.label }}</strong>
            <p v-if="row.hint">{{ row.hint }}</p>
          </div>
          <div class="marks" role="group" :aria-label="row.label">
            <button
              v-for="n in row.max + 1"
              :key="n"
              type="button"
              :aria-pressed="row.score === n - 1"
              @click="setScore(item.id, row.id, n - 1)"
            >{{ n - 1 }}</button>
          </div>
          <input
            class="note"
            :value="row.note"
            placeholder="案例或备注"
            :aria-label="`${row.label}的备注`"
            @change="writeScoreNote(item.id, row.id, ($event.target as HTMLInputElement).value)"
          />
        </li>
      </ul>

      <div v-else-if="item.kind === 'table'" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th v-for="col in item.columns" :key="col.id">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in item.rows" :key="row.id">
              <td v-for="col in item.columns" :key="col.id">
                <input
                  :value="row.cells[col.id] || ''"
                  :aria-label="`${item.title} ${col.label}`"
                  @change="writeCell(item.id, row.id, col.id, ($event.target as HTMLInputElement).value)"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <button type="button" class="add" @click="addRow(item.id)">加一行</button>
      </div>

      <div v-else-if="item.kind === 'cards'" class="cards">
        <article v-for="card in item.cards" :key="card.id" :class="{ chosen: card.chosen }">
          <header>
            <h4>{{ card.title }}</h4>
            <button type="button" :aria-pressed="card.chosen" @click="toggleCard(item.id, card.id)">
              {{ card.chosen ? '已选用' : '选用' }}
            </button>
          </header>
          <p>{{ card.summary }}</p>
          <p><strong>适合：</strong>{{ card.fit }}</p>
          <p><strong>风险：</strong>{{ card.risk }}</p>
          <textarea
            :value="card.note"
            placeholder="我们为什么选它，或为什么先不选"
            :aria-label="`${card.title}的记录`"
            @change="writeCard(item.id, card.id, ($event.target as HTMLTextAreaElement).value)"
          />
        </article>
      </div>

      <div v-else-if="item.kind === 'roi'" class="roi">
        <article v-for="scenario in item.scenarios" :key="scenario.id">
          <h4>{{ scenario.name }}</h4>
          <label>每月任务量<input type="number" :value="scenario.tasks" @change="writeRoi(item.id, scenario.id, 'tasks', ($event.target as HTMLInputElement).value)" /></label>
          <label>改造前分钟<input type="number" :value="scenario.beforeMin" @change="writeRoi(item.id, scenario.id, 'beforeMin', ($event.target as HTMLInputElement).value)" /></label>
          <label>改造后分钟<input type="number" :value="scenario.afterMin" @change="writeRoi(item.id, scenario.id, 'afterMin', ($event.target as HTMLInputElement).value)" /></label>
          <label>综合时薪<input type="number" :value="scenario.wage" @change="writeRoi(item.id, scenario.id, 'wage', ($event.target as HTMLInputElement).value)" /></label>
          <label>有效采用率<input type="number" min="0" max="1" step="0.05" :value="scenario.adoption" @change="writeRoi(item.id, scenario.id, 'adoption', ($event.target as HTMLInputElement).value)" /></label>
          <label>每月平台与运维<input type="number" :value="scenario.monthlyCost" @change="writeRoi(item.id, scenario.id, 'monthlyCost', ($event.target as HTMLInputElement).value)" /></label>
          <label>一次性建设<input type="number" :value="scenario.upfront" @change="writeRoi(item.id, scenario.id, 'upfront', ($event.target as HTMLInputElement).value)" /></label>
          <dl>
            <div><dt>每月节省工时</dt><dd>{{ roiOf(scenario).hours.toFixed(0) }} 小时</dd></div>
            <div><dt>每月毛价值</dt><dd>{{ money(roiOf(scenario).gross) }}</dd></div>
            <div><dt>每月净价值</dt><dd>{{ money(roiOf(scenario).net) }}</dd></div>
            <div><dt>回本</dt><dd>{{ roiOf(scenario).payback == null ? '净值为负' : `${roiOf(scenario).payback.toFixed(1)} 个月` }}</dd></div>
            <div><dt>首年净价值</dt><dd>{{ money(roiOf(scenario).year) }}</dd></div>
          </dl>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sheet { position: absolute; inset: 0; box-sizing: border-box; overflow: auto; padding: 18px 20px 28px; color: #202124; background: var(--cv-page, #f4f0e8); }
.top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; }
.kicker, .top h2, .lede, .weak, .block h3, .block header p, .cards p { margin: 0; }
.kicker { color: #a84562; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; }
.top h2 { margin-top: 4px; font-size: 28px; }
.lede, .weak { margin-top: 8px; max-width: 78ch; color: #5c574e; line-height: 1.55; }
.score { margin: 0; padding: 8px 12px; border-radius: 16px; background: #fff; text-align: right; }
.score strong { display: block; color: #125c3b; font-size: 22px; }
.block { margin-top: 14px; padding: 14px; border-radius: 14px; background: #fffdf8; border: 1px solid rgba(62, 48, 28, 0.08); }
.block header p { margin-top: 4px; color: #5c574e; font-size: 13px; line-height: 1.5; }
.block :deep(.rte-root) {
  margin-top: 8px;
  height: 120px;
  min-height: 120px;
  max-height: 120px;
  overflow: hidden;
  border: none;
  background: transparent;
  box-shadow: none;
}
.block:not(:focus-within) :deep(.rte-toolbar) { display: none; }
.block :deep(.rte-workspace),
.block :deep(.rte-canvas),
.block :deep(.rte-body) { flex: 1 1 auto; min-height: 0; }
.block :deep(.rte-canvas) { background: transparent; overflow: auto; }
.block :deep(.ProseMirror) { min-height: 0; }
.checks, .scores { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.checks li, .scores li { display: grid; grid-template-columns: minmax(180px, 1.4fr) minmax(140px, 0.8fr); gap: 8px; align-items: center; }
.scores li { grid-template-columns: minmax(220px, 1.4fr) auto minmax(140px, 0.8fr); }
.checks label { display: flex; gap: 8px; align-items: flex-start; }
.marks { display: flex; gap: 4px; }
.marks button, .add, .cards button { border: 1px solid #e4ddd2; background: #fff; border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.marks button[aria-pressed='true'], .cards button[aria-pressed='true'] { background: #187a4e; border-color: #187a4e; color: #fff; }
.note, .table-wrap input, .cards textarea, .roi input { width: 100%; box-sizing: border-box; border: 1px solid #e4ddd2; border-radius: 8px; padding: 6px 8px; font: inherit; background: #fff; }
.table-wrap { overflow: auto; margin-top: 10px; }
table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid #f1ebe3; padding: 6px; text-align: left; vertical-align: top; }
th { font-size: 12px; color: #5c574e; }
.add { margin-top: 8px; }
.cards, .roi { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 10px; }
.cards article, .roi article { padding: 12px; border-radius: 12px; background: #f7f1e6; display: flex; flex-direction: column; gap: 6px; }
.cards article.chosen { outline: 2px solid #187a4e; }
.cards header, .roi h4 { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.cards h4, .roi h4 { margin: 0; }
.roi label { display: flex; justify-content: space-between; gap: 8px; align-items: center; font-size: 13px; }
.roi input { width: 96px; }
.roi dl { margin: 6px 0 0; }
.roi dl div { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
.roi dt { color: #5c574e; }
@media (max-width: 800px) {
  .checks li, .scores li, .top { display: flex; flex-direction: column; align-items: stretch; }
  .top h2 { font-size: 22px; }
}
</style>

<style>
.canvas-viewport .sheet.fde-sheet .block > header,
.canvas-viewport .sheet.fde-sheet .block h3 {
  background: none;
  text-shadow: none;
  color: #3e3428;
  padding: 0;
}
.canvas-viewport .sheet.fde-sheet .block > header p {
  color: #5c574e;
  text-shadow: none;
}
</style>
