<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { RaciMatrixDocumentJSON } from '../../types/canvas'
import { isRaciMatrixDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { cycleRaci, newCanvasId } from '../../utils/classicCanvases'

const props = defineProps<{ doc: RaciMatrixDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))

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
  documentStore.mutateCanvas((doc) => {
    if (!isRaciMatrixDoc(doc)) return
    const cells: Record<string, ''> = {}
    for (const role of doc.roles) cells[role.id] = ''
    doc.tasks = [...doc.tasks, { id: newCanvasId('task'), name: '新工作', cells }]
  })
}
</script>

<template>
  <div class="raci" :style="chrome" aria-label="RACI 责任矩阵">
    <header>
      <h2>{{ doc.title }}</h2>
      <p>点格子循环：空 → R 执行 → A 负责 → C 顾问 → I 知情。</p>
      <button type="button" @click="addTask">添加工作</button>
    </header>
    <table>
      <thead>
        <tr>
          <th>工作</th>
          <th v-for="role in doc.roles" :key="role.id">
            <input :value="role.name" :aria-label="`角色 ${role.name}`" @change="rename('role', role.id, ($event.target as HTMLInputElement).value)" />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="task in doc.tasks" :key="task.id">
          <th><input :value="task.name" aria-label="工作名称" @change="rename('task', task.id, ($event.target as HTMLInputElement).value)" /></th>
          <td v-for="role in doc.roles" :key="role.id">
            <button type="button" :aria-label="`${task.name} ${role.name}`" @click="cycle(task.id, role.id)">
              {{ task.cells[role.id] || '·' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.raci { height: 100%; overflow: auto; padding: 16px; color: #202124; }
header { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
header h2, header p { margin: 0; }
header p { color: #5f6368; font-size: 13px; }
table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { border: 1px solid #ececec; padding: 6px; text-align: center; }
th:first-child, td:first-child { text-align: left; }
input { width: 100%; border: 0; background: transparent; font: inherit; }
button { min-width: 36px; border: 0; background: #eef3f8; border-radius: 6px; font-weight: 700; }
</style>
