<script setup lang="ts">
/**
 * 模板中心（飞书「模板中心」）。
 *
 * 模板多了以后放在下拉里没法找，所以单独开一页：
 * 按分类浏览、按作用域过滤、可调排序、可新建/编辑/删除。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as knowledgeApi from '../api/knowledge'
import { updateDocument } from '../api/documents'
import type { KnowledgeTemplate } from '../api/knowledge'
import { updateTemplateProperties } from '../api/knowledge_v5'
import type { FieldDef } from '../api/knowledge_v5'
import { friendlyApiMessage } from '../utils/apiMessage'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId ?? ''))

const templates = ref<KnowledgeTemplate[]>([])
const loading = ref(false)
const keyword = ref('')
const scope = ref<'all' | 'builtin' | 'personal' | 'team' | 'project'>('all')
const category = ref('all')

const scopeLabels: Record<string, string> = {
  builtin: '内置',
  personal: '个人',
  team: '团队',
  project: '项目',
}

const filtered = computed(() =>
  templates.value.filter((tpl) => {
    if (scope.value === 'builtin' && !tpl.builtin) return false
    if (scope.value !== 'all' && scope.value !== 'builtin' && tpl.scope !== scope.value) return false
    if (category.value !== 'all' && tpl.category !== category.value) return false
    if (keyword.value && !tpl.label.includes(keyword.value)) return false
    return true
  }),
)

const groups = computed(() => {
  const map = new Map<string, KnowledgeTemplate[]>()
  for (const tpl of filtered.value) {
    const key = tpl.category || '通用'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(tpl)
  }
  return [...map.entries()].map(([name, items]) => ({
    name,
    items: items.sort((a, b) => a.sortOrder - b.sortOrder),
  }))
})

/** 模板占位符替换：{标题}/{日期}/{负责人}/{作者}。 */
function fillPlaceholders(html: string, title: string) {
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
  const owner = useAuthStore().user?.displayName ?? ''
  return html
    .replace(/\{标题\}/g, title)
    .replace(/\{日期\}/g, date)
    .replace(/\{负责人\}/g, owner)
    .replace(/\{作者\}/g, owner)
}

const categories = computed(() => [...new Set(templates.value.map((t) => t.category || '通用'))])

/** 模板携带的属性定义（017）。 */
const propsTarget = ref<KnowledgeTemplate | null>(null)
const propsFields = ref<FieldDef[]>([])
const propsOpen = ref(false)

function openProps(tpl: KnowledgeTemplate) {
  propsTarget.value = tpl
  propsFields.value = [...((tpl as unknown as { properties?: FieldDef[] }).properties ?? [])]
  propsOpen.value = true
}

function addPropsField() {
  propsFields.value.push({
    key: `field${propsFields.value.length + 1}`,
    label: '新字段',
    type: 'text',
    required: false,
    order: propsFields.value.length + 1,
  })
}

async function saveProps() {
  if (!propsTarget.value) return
  try {
    await updateTemplateProperties(projectId.value, propsTarget.value.id, propsFields.value)
    ElMessage.success('模板属性已保存')
    propsOpen.value = false
    await load()
  } catch {
    ElMessage.error('保存模板属性失败')
  }
}

async function load() {
  loading.value = true
  try {
    templates.value = await knowledgeApi.listTemplates(projectId.value)
  } catch {
    templates.value = []
  } finally {
    loading.value = false
  }
}

/** 用模板新建一篇文档，直接回到知识库打开它。 */
async function useTemplate(tpl: KnowledgeTemplate) {
  try {
    const node = await knowledgeApi.createKnowledgeNode(projectId.value, {
      nodeType: 'doc',
      title: tpl.label,
      createDoc: true,
    })
    if (tpl.html && node.documentId) {
      // 模板占位符在创建时填成实际值（标题 / 日期 / 负责人）。
      const html = fillPlaceholders(tpl.html, tpl.label)
      await updateDocument(node.documentId, {
        title: tpl.label,
        currentData: { type: 'doc', html } as never,
        operationId: `tpl-${node.documentId}-${Date.now()}`,
      })
    }
    ElMessage.success('已创建文档')
    await router.push({
      name: 'knowledge-doc',
      params: { projectId: projectId.value, documentId: node.documentId ?? '' },
    })
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '创建失败'))
  }
}

/** 模板排序：同一分类内上下移动。 */
async function move(tpl: KnowledgeTemplate, delta: number) {
  const siblings = filtered.value.filter((t) => t.category === tpl.category)
  const index = siblings.findIndex((t) => t.id === tpl.id)
  const target = siblings[index + delta]
  if (!target) return
  try {
    await knowledgeApi.updateTemplate(projectId.value, tpl.id, { sortOrder: target.sortOrder })
    await knowledgeApi.updateTemplate(projectId.value, target.id, { sortOrder: tpl.sortOrder })
    await load()
  } catch {
    ElMessage.error('排序失败')
  }
}

/** 改作用域：个人 / 团队 / 项目。 */
async function changeScope(tpl: KnowledgeTemplate, next: string) {
  try {
    await knowledgeApi.updateTemplate(projectId.value, tpl.id, { scope: next })
    await load()
  } catch {
    ElMessage.error('修改作用域失败')
  }
}

async function remove(tpl: KnowledgeTemplate) {
  try {
    await ElMessageBox.confirm(`删除模板「${tpl.label}」？`, '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await knowledgeApi.deleteTemplate(projectId.value, tpl.id)
    ElMessage.success('已删除')
    await load()
  } catch {
    ElMessage.error('删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="tpl-center">
    <header class="tpl-center__head">
      <el-button text @click="router.back()">← 返回知识库</el-button>
      <h2>模板中心</h2>
      <div class="tpl-center__filters">
        <el-input v-model="keyword" placeholder="搜索模板" size="small" clearable />
        <el-select v-model="scope" size="small">
          <el-option label="全部作用域" value="all" />
          <el-option label="内置" value="builtin" />
          <el-option label="个人" value="personal" />
          <el-option label="团队" value="team" />
          <el-option label="项目" value="project" />
        </el-select>
        <el-select v-model="category" size="small">
          <el-option label="全部分类" value="all" />
          <el-option v-for="item in categories" :key="item" :label="item" :value="item" />
        </el-select>
      </div>
    </header>

    <p v-if="loading" class="tpl-center__empty">加载中…</p>
    <p v-else-if="!groups.length" class="tpl-center__empty">没有匹配的模板。</p>

    <section v-for="group in groups" :key="group.name" class="tpl-center__group">
      <h3>{{ group.name }}</h3>
      <div class="tpl-center__grid">
        <article v-for="tpl in group.items" :key="tpl.id" class="tpl-card">
          <div class="tpl-card__icon">{{ tpl.icon }}</div>
          <div class="tpl-card__body">
            <div class="tpl-card__title">{{ tpl.label }}</div>
            <div class="tpl-card__meta">
              <el-tag size="small" type="info">{{ scopeLabels[tpl.builtin ? 'builtin' : tpl.scope] ?? '个人' }}</el-tag>
              <span>{{ tpl.builtin ? '系统内置' : '自定义模板' }}</span>
            </div>
          </div>
          <div class="tpl-card__ops">
            <el-button size="small" type="primary" @click="useTemplate(tpl)">使用</el-button>
            <template v-if="!tpl.builtin">
              <el-dropdown trigger="click" @command="(cmd: string) => changeScope(tpl, cmd)">
                <el-button size="small" text>作用域</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="personal">仅自己</el-dropdown-item>
                    <el-dropdown-item command="team">团队共享</el-dropdown-item>
                    <el-dropdown-item command="project">仅本项目</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button size="small" text @click="openProps(tpl)">属性</el-button>
              <el-button size="small" text @click="move(tpl, -1)">↑</el-button>
              <el-button size="small" text @click="move(tpl, 1)">↓</el-button>
              <el-button size="small" text type="danger" @click="remove(tpl)">删除</el-button>
            </template>
          </div>
        </article>
      </div>
    </section>
    <el-dialog v-model="propsOpen" title="模板属性定义" width="520px" append-to-body>
      <p class="tpl-center__empty">用模板创建文档时，这些属性会自动写入页面属性。</p>
      <div v-for="(field, index) in propsFields" :key="index" class="tpl-center__field">
        <el-input v-model="field.label" size="small" style="width: 120px" />
        <el-input v-model="field.key" size="small" style="width: 110px" />
        <el-select v-model="field.type" size="small" style="width: 100px">
          <el-option label="文本" value="text" />
          <el-option label="数字" value="number" />
          <el-option label="日期" value="date" />
          <el-option label="单选" value="select" />
          <el-option label="人员" value="user" />
        </el-select>
        <el-checkbox v-model="field.required" size="small">必填</el-checkbox>
        <el-button size="small" text type="danger" @click="propsFields.splice(index, 1)">删除</el-button>
      </div>
      <template #footer>
        <el-button @click="propsOpen = false">取消</el-button>
        <el-button @click="addPropsField">添加字段</el-button>
        <el-button type="primary" @click="saveProps">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tpl-center { padding: 16px 20px; overflow: auto; height: 100%; }
.tpl-center__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.tpl-center__head h2 { margin: 0; font-size: 16px; }
.tpl-center__filters { display: flex; gap: 8px; margin-left: auto; }
.tpl-center__filters .el-input { width: 200px; }
.tpl-center__group h3 { font-size: 13px; color: var(--mm-muted, #86909c); margin: 18px 0 8px; }
.tpl-center__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.tpl-card {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--mm-line, #e5e6eb);
  border-radius: 8px;
  background: var(--mm-surface, #fff);
}
.tpl-card__icon { font-size: 20px; }
.tpl-card__body { flex: 1; min-width: 0; }
.tpl-card__title { font-size: 13px; font-weight: 600; color: var(--mm-text, #1d2129); }
.tpl-card__meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--mm-muted, #86909c); margin-top: 2px; }
.tpl-card__ops { display: flex; align-items: center; gap: 2px; }
.tpl-center__empty { color: var(--mm-muted, #86909c); font-size: 13px; padding: 24px 0; }
.tpl-center__field { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
</style>
