<script setup lang="ts">
import { computed, ref } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { RaciLetter, RaciMatrixDocumentJSON } from '../../types/canvas'
import { isRaciMatrixDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { cycleRaci, newCanvasId } from '../../utils/classicCanvases'
import { indentRaci, outdentRaci, raciOutline, removeRaciTask } from '../../utils/raciOutline'
import { toneAt } from './fiveStepPalette'

const props = defineProps<{ doc: RaciMatrixDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const selectedId = ref<string | null>(null)
const rows = computed(() => raciOutline(props.doc.tasks).filter((row) => !row.hidden))
const selectedIndex = computed(() => props.doc.tasks.findIndex((task) => task.id === selectedId.value))

const letters: Array<{ id: RaciLetter; label: string }> = [
  { id: 'R', label: '执行' },
  { id: 'A', label: '负责' },
  { id: 'C', label: '顾问' },
  { id: 'I', label: '知情' },
]

function roleStyle(index: number) {
  const tone = toneAt(index)
  return { '--role-header': tone.header, '--role-body': tone.body, '--role-topic': tone.topic }
}

function replaceTasks(tasks: RaciMatrixDocumentJSON['tasks']) {
  documentStore.mutateCanvas((doc) => {
    if (!isRaciMatrixDoc(doc)) return
    doc.tasks = tasks
  })
}

function cycle(taskId: string, roleId: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isRaciMatrixDoc(doc)) return
    doc.tasks = doc.tasks.map((task) => {
      if (task.id !== taskId) return task
      return { ...task, cells: { ...task.cells, [roleId]: cycleRaci(task.cells[roleId]) } }
    })
  })
}

function rename(kind: 'role' | 'task', id: string, name: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isRaciMatrixDoc(doc)) return
    if (kind === 'role') doc.roles = doc.roles.map((role) => (role.id === id ? { ...role, name } : role))
    else doc.tasks = doc.tasks.map((task) => (task.id === id ? { ...task, name } : task))
  })
}

function addTask() {
  const index = selectedIndex.value
  const anchor = index >= 0 ? props.doc.tasks[index] : undefined
  const cells: Record<string, ''> = {}
  for (const role of props.doc.roles) cells[role.id] = ''
  const item = { id: newCanvasId('task'), name: '新工作', cells, parentId: anchor?.parentId || null }
  const next = [...props.doc.tasks]
  next.splice(index >= 0 ? index + 1 : next.length, 0, item)
  replaceTasks(next)
  selectedId.value = item.id
}

function removeSelected() {
  if (!selectedId.value) return
  const next = removeRaciTask(props.doc.tasks, selectedId.value)
  replaceTasks(next)
  if (!next.some((task) => task.id === selectedId.value)) selectedId.value = next[0]?.id || null
}

function toggle(id: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isRaciMatrixDoc(doc)) return
    doc.tasks = doc.tasks.map((task) => (task.id === id ? { ...task, collapsed: !task.collapsed } : task))
  })
}
</script>

<template>
  <div class="raci" :style="chrome" aria-label="RACI 责任矩阵">
    <header class="raci-top">
      <div>
        <h2>{{ doc.title }}</h2>
        <p>工作按树排列。点格子循环：空 → R 执行 → A 负责 → C 顾问 → I 知情。</p>
      </div>
      <div class="legend" aria-label="RACI 图例">
        <span class="letter letter-R">R {{ letters[0].label }}</span>
        <span class="letter letter-A">A {{ letters[1].label }}</span>
        <span class="letter letter-C">C {{ letters[2].label }}</span>
        <span class="letter letter-I">I {{ letters[3].label }}</span>
      </div>
      <div class="tools">
        <button type="button" @click="addTask">添加工作</button>
        <button type="button" :disabled="selectedIndex <= 0" @click="replaceTasks(indentRaci(doc.tasks, selectedIndex))">降级</button>
        <button type="button" :disabled="selectedIndex < 0 || !doc.tasks[selectedIndex]?.parentId" @click="replaceTasks(outdentRaci(doc.tasks, selectedIndex))">升级</button>
        <button type="button" :disabled="!selectedId || doc.tasks.length <= 1" @click="removeSelected">删除</button>
      </div>
    </header>
    <div class="raci-sheet">
      <table>
        <thead>
          <tr>
            <th class="work-head">工作</th>
            <th v-for="(role, index) in doc.roles" :key="role.id" :style="roleStyle(index)">
              <input :value="role.name" :aria-label="`角色 ${role.name}`" @change="rename('role', role.id, ($event.target as HTMLInputElement).value)" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.task.id"
            :class="{ selected: row.task.id === selectedId }"
            :data-level="row.level"
            @click="selectedId = row.task.id"
          >
            <th>
              <div class="work">
                <span class="indent" :style="{ width: row.level * 18 + 'px' }" />
                <button
                  v-if="row.hasChildren"
                  type="button"
                  class="twist"
                  :aria-label="row.task.collapsed ? '展开' : '折叠'"
                  @click.stop="toggle(row.task.id)"
                >{{ row.task.collapsed ? '▸' : '▾' }}</button>
                <span v-else class="twist twist--blank" />
                <span class="wbs">{{ row.wbs }}</span>
                <input :value="row.task.name" aria-label="工作名称" @change="rename('task', row.task.id, ($event.target as HTMLInputElement).value)" />
              </div>
            </th>
            <td v-for="role in doc.roles" :key="role.id">
              <button
                type="button"
                class="cell"
                :class="`letter-${row.task.cells[role.id] || 'empty'}`"
                :aria-label="`${row.task.name} ${role.name}`"
                @click.stop="cycle(row.task.id, role.id)"
              >
                {{ row.task.cells[role.id] || '·' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.raci {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 14px 14px;
  color: #202124;
  background: var(--cv-page, #f7f7f7);
}
.raci-top { flex: none; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin-bottom: 10px; }
.raci-top h2, .raci-top p { margin: 0; }
.raci-top p { color: #5f6368; font-size: 13px; }
.legend, .tools { display: flex; gap: 6px; align-items: center; }
.letter, .cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 36px;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 8px;
  font-weight: 700;
  border: 0;
}
.letter-R, .cell.letter-R { background: #0e8a84; color: #fff; }
.letter-A, .cell.letter-A { background: #a67c00; color: #fff; }
.letter-C, .cell.letter-C { background: #b85a38; color: #fff; }
.letter-I, .cell.letter-I { background: #2a649f; color: #fff; }
.letter-empty, .cell.letter-empty { background: #f1f3f4; color: #9aa0a6; }
.tools button { border: 1px solid #dadce0; background: #fff; border-radius: 999px; min-height: 32px; padding: 4px 12px; font-size: 13px; cursor: pointer; }
.tools button:disabled { color: #9aa0a6; }
.raci-sheet {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 12px;
}
table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid #f1f3f4; padding: 8px 10px; text-align: center; font-size: 14px; }
thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 44px;
  background: var(--role-header, #f3f6f9);
  color: #fff;
  font-size: 13px;
}
.work-head { text-align: left; background: #3e5a78 !important; width: 32%; }
thead input { color: #fff; }
tbody th { text-align: left; font-weight: 500; }
tr.selected td, tr.selected th { background: #e8f0fe; }
input { width: 100%; min-height: 32px; border: 0; background: transparent; font: inherit; font-size: 15px; color: inherit; }
.work { display: flex; align-items: center; gap: 6px; }
.indent, .twist--blank { flex: none; display: inline-block; width: 24px; }
.twist { flex: none; width: 24px; height: 24px; border: 0; background: transparent; color: #5f6368; cursor: pointer; }
.wbs { flex: none; color: #5f6368; font-size: 13px; min-width: 36px; font-variant-numeric: tabular-nums; }
.cell { width: 44px; height: 44px; min-width: 44px; min-height: 44px; font-size: 16px; cursor: pointer; }
</style>
