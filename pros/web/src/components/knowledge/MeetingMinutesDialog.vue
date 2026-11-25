<script setup lang="ts">
/**
 * 会议纪要 + 录音转写 + 字幕导入（清单 104 / 105）。
 *
 * 录音走浏览器的 MediaRecorder，转写交给后端（配置了语音模型时用模型，
 * 没配置时提示改用字幕导入）；字幕导入完全本地可用。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Close, Document, Memo, Microphone, Upload } from '@element-plus/icons-vue'
import {
  buildMeetingMinutes,
  createDocFromTranscript,
  transcribeAudio,
  type MeetingInput,
  type MeetingMinutes,
} from '../../api/knowledge_v6'
import { listDirectoryUsers, type DirectoryUser } from '../../api/directory'
import { friendlyApiMessage } from '../../utils/apiMessage'
import { parseSubtitle } from './subtitle'

const props = defineProps<{ projectId: string; parentId?: string | null }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ created: [documentId: string] }>()

type MeetingTab = 'minutes' | 'record' | 'subtitle'
const tab = ref<MeetingTab>('minutes')
const loading = ref(false)
const recording = ref(false)
const minutes = ref<MeetingMinutes | null>(null)

/** 顶部分段切换的三个页签。 */
const tabItems: Array<{ id: MeetingTab; label: string; icon: typeof Memo }> = [
  { id: 'minutes', label: '会议纪要', icon: Memo },
  { id: 'record', label: '录音转写', icon: Microphone },
  { id: 'subtitle', label: '字幕导入', icon: Document },
]

/** 录音计时：按钮上直接显示已录时长，避免用户不知道是否在录。 */
const recordSeconds = ref(0)
let recordTimer: ReturnType<typeof setInterval> | null = null
function startRecordTimer() {
  stopRecordTimer()
  recordTimer = setInterval(() => {
    recordSeconds.value += 1
  }, 1000)
}
function stopRecordTimer() {
  if (recordTimer) clearInterval(recordTimer)
  recordTimer = null
}
onUnmounted(() => stopRecordTimer())
const recordingHint = computed(() => {
  const m = String(Math.floor(recordSeconds.value / 60)).padStart(2, '0')
  const s = String(recordSeconds.value % 60).padStart(2, '0')
  return `停止录音（${m}:${s}）`
})

/** 底部提示：告诉用户当前能做什么、还差什么。 */
const footerHint = computed(() => {
  if (tab.value === 'subtitle') return '导入 SRT / VTT 后可直接生成文档'
  if (!canGenerate.value) return '填写「会议记录」或「议程」后才能生成纪要'
  if (minutes.value) return '已生成纪要，可直接存为文档'
  return '生成后可在弹窗内预览议题、结论与待办'
})

const form = ref<MeetingInput>({
  title: '',
  time: '',
  attendees: [],
  agenda: '',
  notes: '',
  transcript: '',
})

const users = ref<DirectoryUser[]>([])
const canGenerate = computed(() => !!(form.value.transcript || form.value.notes || form.value.agenda))

watch(visible, (open) => {
  if (!open) return
  minutes.value = null
  void loadUsers()
})

async function loadUsers() {
  try {
    users.value = await listDirectoryUsers({ limit: 50 })
  } catch {
    users.value = []
  }
}

async function generate() {
  if (!canGenerate.value) {
    ElMessage.warning('请先填写会议记录或转写内容')
    return
  }
  loading.value = true
  try {
    const data = await buildMeetingMinutes(props.projectId, form.value)
    minutes.value = data.minutes
    ElMessage.success(data.minutes.mode === 'ai' ? '已用模型整理纪要' : '已生成纪要')
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '生成纪要失败'))
  } finally {
    loading.value = false
  }
}

async function saveAsDoc() {
  if (!minutes.value) return
  loading.value = true
  try {
    const data = await buildMeetingMinutes(props.projectId, {
      ...form.value,
      createDoc: true,
      parentId: props.parentId ?? null,
    })
    minutes.value = data.minutes
    if (data.node?.documentId) {
      ElMessage.success('纪要已存为文档')
      emit('created', data.node.documentId)
      visible.value = false
    }
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '保存纪要失败'))
  } finally {
    loading.value = false
  }
}

/** 录音：浏览器采集 → 后端转写。 */
let recorder: MediaRecorder | null = null
let chunks: BlobPart[] = []

async function toggleRecording() {
  if (recording.value) {
    recorder?.stop()
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recorder = new MediaRecorder(stream)
    chunks = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop())
      recording.value = false
      stopRecordTimer()
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      await uploadAudio(blob)
    }
    recorder.start()
    recording.value = true
    recordSeconds.value = 0
    startRecordTimer()
  } catch {
    ElMessage.warning('无法访问麦克风，请检查浏览器权限')
  }
}

async function uploadAudio(blob: Blob) {
  loading.value = true
  try {
    const file = new File([blob], 'meeting.webm', { type: blob.type })
    const text = await transcribeAudio(props.projectId, file)
    if (!text) {
      ElMessage.warning('没有识别到语音内容')
      return
    }
    form.value.transcript = `${form.value.transcript ?? ''}${form.value.transcript ? '\n' : ''}${text}`
    ElMessage.success('转写完成')
    tab.value = 'minutes'
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '录音转写失败（未配置语音模型时可改用字幕导入）'))
  } finally {
    loading.value = false
  }
}

async function onAudioFile(file: File) {
  await uploadAudio(file)
}

/** 字幕导入：解析 SRT / VTT 后填进会议记录。 */
async function onSubtitleFile(file: File) {
  const text = await file.text()
  const lines = parseSubtitle(text)
  if (!lines.length) {
    ElMessage.warning('没有解析到字幕内容')
    return
  }
  form.value.transcript = lines.join('\n')
  tab.value = 'minutes'
  ElMessage.success(`已导入 ${lines.length} 条字幕`)
}

async function createDocFromSubtitle() {
  if (!form.value.transcript) {
    ElMessage.warning('请先导入字幕')
    return
  }
  loading.value = true
  try {
    const node = await createDocFromTranscript(props.projectId, {
      title: form.value.title || '字幕转文档',
      transcript: form.value.transcript,
      parentId: props.parentId ?? null,
    })
    ElMessage.success('已生成文档')
    if (node.documentId) emit('created', node.documentId)
    visible.value = false
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '生成文档失败'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="meeting-dialog"
    width="760px"
    align-center
    append-to-body
    :close-on-click-modal="false"
    :show-close="false"
  >
    <template #header>
      <div class="meeting-dialog__head">
        <span class="meeting-dialog__icon" aria-hidden="true">
          <el-icon><Memo /></el-icon>
        </span>
        <div class="meeting-dialog__titles">
          <h3 class="meeting-dialog__title">会议纪要</h3>
          <p class="meeting-dialog__sub">整理议题与结论，可直接存为知识库文档</p>
        </div>
        <button class="meeting-dialog__close" type="button" aria-label="关闭" @click="visible = false">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </template>

    <!-- 分段切换：三个页签共用一块固定高度面板，切换时弹窗高度不跳 -->
    <div class="meeting-dialog__tabs" role="tablist" aria-label="会议纪要功能">
      <button
        v-for="item in tabItems"
        :key="item.id"
        type="button"
        class="meeting-dialog__tab"
        :class="{ 'is-active': tab === item.id }"
        role="tab"
        :aria-selected="tab === item.id"
        @click="tab = item.id"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </button>
    </div>

    <div class="meeting-dialog__body">
      <!-- 会议纪要 -->
      <section v-show="tab === 'minutes'" class="meeting-panel" role="tabpanel">
        <div class="meeting-grid">
          <label class="meeting-field">
            <span class="meeting-field__label">会议主题</span>
            <el-input v-model="form.title" placeholder="例如：Q4 渠道复盘周会" />
          </label>
          <label class="meeting-field">
            <span class="meeting-field__label">会议时间</span>
            <el-input v-model="form.time" placeholder="例如：2026-11-21 15:00" />
          </label>
          <label class="meeting-field meeting-field--wide">
            <span class="meeting-field__label">参与人</span>
            <el-select v-model="form.attendees" multiple filterable placeholder="选择参与人">
              <el-option v-for="u in users" :key="u.id" :label="`${u.name}（${u.email}）`" :value="u.name" />
            </el-select>
          </label>
          <label class="meeting-field meeting-field--wide">
            <span class="meeting-field__label">议程</span>
            <el-input v-model="form.agenda" type="textarea" :rows="2" placeholder="议题列表，一行一条" />
          </label>
          <label class="meeting-field meeting-field--wide">
            <span class="meeting-field__label">
              会议记录
              <em class="meeting-field__count">{{ (form.transcript || '').length }} 字</em>
            </span>
            <el-input
              v-model="form.transcript"
              type="textarea"
              :rows="5"
              placeholder="粘贴会议记录或转写文本；# 开头为议题，结论/负责/待办等句子会被自动抽取"
            />
          </label>
        </div>

        <div v-if="minutes" class="meeting-preview">
          <div class="meeting-preview__head">
            <span class="meeting-preview__title">生成结果</span>
            <span class="meeting-preview__mode">{{ minutes.mode === 'ai' ? '模型整理' : '规则抽取' }}</span>
          </div>
          <div class="meeting-preview__grid">
            <div class="meeting-preview__col">
              <h4>议题</h4>
              <ul>
                <li v-for="(t, i) in minutes.topics" :key="'t' + i">{{ t }}</li>
              </ul>
            </div>
            <div class="meeting-preview__col">
              <h4>结论</h4>
              <ul>
                <li v-for="(d, i) in minutes.decisions" :key="'d' + i">{{ d }}</li>
              </ul>
            </div>
            <div class="meeting-preview__col meeting-preview__col--wide">
              <h4>待办</h4>
              <ul>
                <li v-for="(a, i) in minutes.actions" :key="'a' + i">
                  {{ a.text }}
                  <span v-if="a.owner" class="meeting__owner">{{ a.owner }}</span>
                </li>
              </ul>
            </div>
          </div>
          <p v-if="minutes.summary" class="meeting__summary">{{ minutes.summary }}</p>
        </div>
      </section>

      <!-- 录音转写 -->
      <section v-show="tab === 'record'" class="meeting-panel" role="tabpanel">
        <div class="meeting-record">
          <button
            type="button"
            class="meeting-record__mic"
            :class="{ 'is-recording': recording }"
            :aria-pressed="recording"
            @click="toggleRecording"
          >
            <el-icon><Microphone /></el-icon>
            <span>{{ recording ? recordingHint : '开始录音' }}</span>
          </button>
          <el-upload
            :show-file-list="false"
            accept="audio/*"
            :on-change="(file: any) => onAudioFile(file.raw)"
          >
            <el-button>
              <el-icon style="margin-right: 6px"><Upload /></el-icon>
              上传音频文件
            </el-button>
          </el-upload>
          <p class="meeting__hint">
            录音需要后端配置语音模型（AI_BASE_URL / AI_API_KEY）；没有模型时请用「字幕导入」。
          </p>
        </div>
      </section>

      <!-- 字幕导入 -->
      <section v-show="tab === 'subtitle'" class="meeting-panel" role="tabpanel">
        <div class="meeting-record">
          <el-upload
            :show-file-list="false"
            accept=".srt,.vtt,.txt"
            :on-change="(file: any) => onSubtitleFile(file.raw)"
          >
            <el-button>
              <el-icon style="margin-right: 6px"><Document /></el-icon>
              选择字幕文件（SRT / VTT）
            </el-button>
          </el-upload>
          <el-input
            v-model="form.transcript"
            type="textarea"
            :rows="6"
            placeholder="也可以直接粘贴字幕文本"
          />
        </div>
      </section>
    </div>

    <template #footer>
      <div class="meeting-dialog__footer">
        <span class="meeting-dialog__hint">
          {{ footerHint }}
        </span>
        <div class="meeting-dialog__buttons">
          <el-button @click="visible = false">取消</el-button>
          <el-button v-if="tab === 'subtitle'" type="primary" :loading="loading" @click="createDocFromSubtitle">
            生成文档
          </el-button>
          <template v-else>
            <el-button :loading="loading" :disabled="!minutes" @click="saveAsDoc">存为文档</el-button>
            <el-button type="primary" :loading="loading" :disabled="!canGenerate" @click="generate">
              生成纪要
            </el-button>
          </template>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.meeting-dialog__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 34px;
}
.meeting-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--mm-blue, #1677ff);
  color: #fff;
  font-size: 18px;
  box-shadow: 0 6px 16px rgba(22, 119, 255, 0.28);
}
.meeting-dialog__titles {
  min-width: 0;
}
.meeting-dialog__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--mm-text, #1d2129);
}
.meeting-dialog__sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.meeting-dialog__close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--mm-muted, #86909c);
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}
.meeting-dialog__close:hover {
  background: rgba(255, 255, 255, 0.72);
  color: var(--mm-text, #1d2129);
}

/* 分段切换 */
.meeting-dialog__tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  margin-bottom: 14px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.05);
}
.meeting-dialog__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--mm-text-2, #5a6472);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}
.meeting-dialog__tab:hover {
  color: var(--mm-text, #1d2129);
}
.meeting-dialog__tab.is-active {
  background: #fff;
  color: var(--mm-blue, #1677ff);
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.1);
}

/* 固定高度面板：三个页签切换时弹窗不跳高 */
.meeting-dialog__body {
  height: 380px;
  overflow-y: auto;
  padding-right: 4px;
}
.meeting-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meeting-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}
.meeting-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.meeting-field--wide {
  grid-column: 1 / -1;
}
.meeting-field__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.meeting-field__count {
  font-style: normal;
  font-size: 11px;
  color: var(--mm-faint, #c9cdd4);
  font-variant-numeric: tabular-nums;
}

/* 生成结果卡片 */
.meeting-preview {
  border: 1px solid var(--mm-line, #e8eaed);
  border-radius: 10px;
  background: var(--mm-surface, #fff);
  padding: 12px 14px;
  max-height: 240px;
  overflow: auto;
}
.meeting-preview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.meeting-preview__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--mm-text, #1d2129);
}
.meeting-preview__mode {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 8px;
  background: rgba(22, 119, 255, 0.1);
  color: var(--mm-blue, #1677ff);
}
.meeting-preview__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
}
.meeting-preview__col--wide {
  grid-column: 1 / -1;
}
.meeting-preview h4 {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.meeting-preview ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--mm-text, #1d2129);
}

/* 录音 / 字幕面板 */
.meeting-record {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
.meeting-record__mic {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: 10px;
  background: var(--mm-blue, #1677ff);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(22, 119, 255, 0.26);
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}
.meeting-record__mic:hover {
  transform: translateY(-1px);
}
.meeting-record__mic.is-recording {
  background: var(--mm-danger, #d93025);
  box-shadow: 0 6px 16px rgba(217, 48, 37, 0.26);
  animation: meeting-pulse 1.4s ease-in-out infinite;
}
@keyframes meeting-pulse {
  0%, 100% { box-shadow: 0 6px 16px rgba(217, 48, 37, 0.26); }
  50% { box-shadow: 0 6px 22px rgba(217, 48, 37, 0.45); }
}
.meeting__hint {
  margin: 0;
  color: var(--mm-muted, #86909c);
  font-size: 12px;
  line-height: 1.6;
}
.meeting__owner {
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 8px;
  background: rgba(22, 119, 255, 0.1);
  color: var(--mm-blue, #1677ff);
  font-size: 11px;
}
.meeting__summary {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px dashed var(--mm-line, #e8eaed);
  font-size: 13px;
  line-height: 1.7;
  color: var(--mm-text-2, #5a6472);
}

/* 底部操作条 */
.meeting-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.meeting-dialog__hint {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
}
.meeting-dialog__buttons {
  display: inline-flex;
  gap: 8px;
}

@media (max-width: 720px) {
  .meeting-grid,
  .meeting-preview__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
