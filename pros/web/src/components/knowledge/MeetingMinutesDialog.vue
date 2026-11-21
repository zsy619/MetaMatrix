<script setup lang="ts">
/**
 * 会议纪要 + 录音转写 + 字幕导入（清单 104 / 105）。
 *
 * 录音走浏览器的 MediaRecorder，转写交给后端（配置了语音模型时用模型，
 * 没配置时提示改用字幕导入）；字幕导入完全本地可用。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
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

const tab = ref<'minutes' | 'record' | 'subtitle'>('minutes')
const loading = ref(false)
const recording = ref(false)
const minutes = ref<MeetingMinutes | null>(null)

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
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      await uploadAudio(blob)
    }
    recorder.start()
    recording.value = true
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
  <el-dialog v-model="visible" title="会议纪要 / 录音转写" width="720px" append-to-body>
    <el-tabs v-model="tab">
      <el-tab-pane label="会议纪要" name="minutes">
        <el-form label-width="82px" size="small">
          <el-form-item label="会议主题">
            <el-input v-model="form.title" placeholder="例如：Q4 渠道复盘周会" />
          </el-form-item>
          <el-form-item label="会议时间">
            <el-input v-model="form.time" placeholder="例如：2026-11-21 15:00" />
          </el-form-item>
          <el-form-item label="参与人">
            <el-select v-model="form.attendees" multiple filterable placeholder="选择参与人">
              <el-option v-for="u in users" :key="u.id" :label="`${u.name}（${u.email}）`" :value="u.name" />
            </el-select>
          </el-form-item>
          <el-form-item label="议程">
            <el-input v-model="form.agenda" type="textarea" :rows="2" placeholder="议题列表" />
          </el-form-item>
          <el-form-item label="会议记录">
            <el-input
              v-model="form.transcript"
              type="textarea"
              :rows="6"
              placeholder="粘贴会议记录或转写文本；# 开头为议题，结论/负责/待办等句子会被自动抽取"
            />
          </el-form-item>
        </el-form>
        <div class="meeting__actions">
          <el-button type="primary" :loading="loading" :disabled="!canGenerate" @click="generate">
            生成纪要
          </el-button>
          <el-button :loading="loading" :disabled="!minutes" @click="saveAsDoc">存为文档</el-button>
        </div>
        <div v-if="minutes" class="meeting__preview">
          <h4>议题</h4>
          <ul>
            <li v-for="(t, i) in minutes.topics" :key="i">{{ t }}</li>
          </ul>
          <h4>结论</h4>
          <ul>
            <li v-for="(d, i) in minutes.decisions" :key="i">{{ d }}</li>
          </ul>
          <h4>待办</h4>
          <ul>
            <li v-for="(a, i) in minutes.actions" :key="i">
              {{ a.text }}
              <span v-if="a.owner" class="meeting__owner">（{{ a.owner }}）</span>
            </li>
          </ul>
          <p v-if="minutes.summary" class="meeting__summary">{{ minutes.summary }}</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="录音转写" name="record">
        <div class="meeting__record">
          <el-button :type="recording ? 'danger' : 'primary'" @click="toggleRecording">
            {{ recording ? '停止录音' : '开始录音' }}
          </el-button>
          <el-upload
            :show-file-list="false"
            accept="audio/*"
            :on-change="(file: any) => onAudioFile(file.raw)"
          >
            <el-button>上传音频文件</el-button>
          </el-upload>
          <p class="meeting__hint">
            录音需要后端配置语音模型（AI_BASE_URL / AI_API_KEY）；没有模型时请用「字幕导入」。
          </p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="字幕导入" name="subtitle">
        <div class="meeting__record">
          <el-upload
            :show-file-list="false"
            accept=".srt,.vtt,.txt"
            :on-change="(file: any) => onSubtitleFile(file.raw)"
          >
            <el-button>选择字幕文件（SRT / VTT）</el-button>
          </el-upload>
          <el-input
            v-model="form.transcript"
            type="textarea"
            :rows="6"
            placeholder="也可以直接粘贴字幕文本"
          />
          <el-button type="primary" :loading="loading" @click="createDocFromSubtitle">
            生成文档
          </el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<style scoped>
.meeting__actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.meeting__preview {
  max-height: 260px;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}
.meeting__preview h4 {
  margin: 8px 0 4px;
  font-size: 13px;
}
.meeting__preview ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
}
.meeting__record {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.meeting__hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.meeting__owner {
  color: var(--el-color-primary);
}
.meeting__summary {
  margin: 8px 0 0;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
}
</style>
