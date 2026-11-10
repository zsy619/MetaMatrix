<script setup lang="ts">
import { computed } from 'vue'
import { canvasChromeStyle } from './canvasChrome'
import type { ProjectGanttDocumentJSON } from '../../types/canvas'
import { isProjectGanttDoc } from '../../types/canvas'
import { useDocumentStore } from '../../stores/document'
import { ganttBar, ganttWindow, newCanvasId } from '../../utils/classicCanvases'

const props = defineProps<{ doc: ProjectGanttDocumentJSON }>()
const documentStore = useDocumentStore()
const chrome = computed(() => canvasChromeStyle(props.doc.theme))
const windowSpan = computed(() => ganttWindow(props.doc.tasks))

function bar(task: ProjectGanttDocumentJSON['tasks'][number]) {
  return ganttBar(task, windowSpan.value)
}

function patchTask(id: string, patch: Partial<ProjectGanttDocumentJSON['tasks'][number]>) {
  documentStore.mutateCanvas((doc) => {
    if (!isProjectGanttDoc(doc)) return
    doc.tasks = doc.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task))
  })
}

function addTask() {
  documentStore.mutateCanvas((doc) => {
    if (!isProjectGanttDoc(doc)) return
    const last = doc.tasks[doc.tasks.length - 1]
    doc.tasks = [
      ...doc.tasks,
      {
        id: newCanvasId('gantt'),
        name: '新任务',
        start: last?.start || '2026-11-09',
        end: last?.end || '2026-11-16',
        progress: 0,
        owner: '',
      },
    ]
  })
}

function removeTask(id: string) {
  documentStore.mutateCanvas((doc) => {
    if (!isProjectGanttDoc(doc) || doc.tasks.length <= 1) return
    doc.tasks = doc.tasks.filter((task) => task.id !== id)
  })
}
</script>

<template>
  <div class="gantt" :style="chrome" aria-label="项目甘特图">
    <header class="gantt-head">
      <h2>{{ doc.title }}</h2>
      <button type="button" @click="addTask">添加任务</button>
    </header>
    <div class="gantt-table" role="table">
      <div class="gantt-row gantt-row--head" role="row">
        <span>任务</span><span>负责人</span><span>开始</span><span>结束</span><span>进度</span><span>时间条</span>
      </div>
      <div v-for="task in doc.tasks" :key="task.id" class="gantt-row" role="row">
        <input :value="task.name" aria-label="任务名称" @change="patchTask(task.id, { name: ($event.target as HTMLInputElement).value })" />
        <input :value="task.owner" aria-label="负责人" @change="patchTask(task.id, { owner: ($event.target as HTMLInputElement).value })" />
        <input type="date" :value="task.start" aria-label="开始日期" @change="patchTask(task.id, { start: ($event.target as HTMLInputElement).value })" />
        <input type="date" :value="task.end" aria-label="结束日期" @change="patchTask(task.id, { end: ($event.target as HTMLInputElement).value })" />
        <input type="number" min="0" max="100" :value="task.progress" aria-label="进度" @change="patchTask(task.id, { progress: Number(($event.target as HTMLInputElement).value) })" />
        <div class="gantt-track" aria-hidden="true">
          <div class="gantt-bar" :style="{ left: bar(task).left + '%', width: bar(task).width + '%' }">
            <span :style="{ width: Math.max(0, Math.min(100, task.progress)) + '%' }" />
          </div>
        </div>
        <button type="button" :disabled="doc.tasks.length <= 1" @click="removeTask(task.id)">删除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gantt { height: 100%; overflow: auto; padding: 16px; box-sizing: border-box; color: #202124; }
.gantt-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.gantt-head h2 { margin: 0; font-size: 18px; }
.gantt-head button, .gantt-row button { border: 1px solid #dadce0; background: #fff; border-radius: 8px; padding: 4px 10px; }
.gantt-table { background: #fff; border: 1px solid #ececec; border-radius: 12px; overflow: hidden; }
.gantt-row { display: grid; grid-template-columns: 1.2fr 0.7fr 0.9fr 0.9fr 0.5fr 1.6fr auto; gap: 8px; align-items: center; padding: 8px 10px; border-top: 1px solid #f1f3f4; }
.gantt-row--head { border-top: 0; background: #eef3f8; font-size: 12px; font-weight: 700; }
.gantt-row input { width: 100%; box-sizing: border-box; border: 1px solid #e0e0e0; border-radius: 6px; padding: 4px 6px; }
.gantt-track { position: relative; height: 16px; background: #f1f3f4; border-radius: 8px; }
.gantt-bar { position: absolute; top: 2px; height: 12px; background: #d2e3fc; border-radius: 6px; overflow: hidden; }
.gantt-bar span { display: block; height: 100%; background: #1a73e8; }
</style>
