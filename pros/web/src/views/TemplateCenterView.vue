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
import { publishTemplate } from '../api/knowledge_v6'
import type { FieldDef } from '../api/knowledge_v5'
import { friendlyApiMessage } from '../utils/apiMessage'
import { useAuthStore } from '../stores/auth'
import AppLoading from '../components/common/AppLoading.vue'
import {
  ArrowLeft,
  Briefcase,
  ChatDotRound,
  Coin,
  Collection,
  DataAnalysis,
  Delete,
  DocumentAdd,
  EditPen,
  Files,
  Grid,
  Lock,
  MagicStick,
  Management,
  MoreFilled,
  OfficeBuilding,
  Promotion,
  Reading,
  Search,
  Setting,
  Top,
  Bottom,
  Trophy,
} from '@element-plus/icons-vue'

/** 作用域按钮组：图标 + 文字，宽度一致、悬停展开。 */
const scopeOptions: Array<{ value: 'all' | 'builtin' | 'personal' | 'team' | 'project'; label: string; icon: unknown }> = [
  { value: 'all', label: '全部', icon: Collection },
  { value: 'builtin', label: '内置', icon: Files },
  { value: 'personal', label: '个人', icon: DocumentAdd },
  { value: 'team', label: '团队', icon: Management },
  { value: 'project', label: '项目', icon: Grid },
]

/** 分类图标：按分类名给一个稳定图标，避免每张卡都是同一个符号。 */
const CATEGORY_ICONS: Record<string, unknown> = {
  通用: Files,
  协作: Management,
  产品: Grid,
  流程: Setting,
  管理: Management,
  市场: Promotion,
  研发: Setting,
  运营: Grid,
  财务: Management,
  人力: DocumentAdd,
  法务: Files,
  教学: Files,
  销售: Promotion,
  客服: ChatDotRound,
  设计: MagicStick,
  数据分析: DataAnalysis,
  安全: Lock,
  行政: OfficeBuilding,
  个人成长: Trophy,
  培训: Reading,
  内容运营: EditPen,
  商务: Coin,
  项目: Briefcase,
}

function categoryIcon(name: string) {
  return CATEGORY_ICONS[name] || Collection
}

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

/** 模板量级到 200 后，单个分类可能十几套：默认只铺前 12 张，其余折叠。 */
const GROUP_PREVIEW = 12
const expandedGroups = ref<Record<string, boolean>>({})
function isExpanded(name: string): boolean {
  return !!expandedGroups.value[name]
}
function toggleGroup(name: string) {
  expandedGroups.value[name] = !isExpanded(name)
}
function visibleItems(group: { name: string; items: KnowledgeTemplate[] }): KnowledgeTemplate[] {
  if (isExpanded(group.name) || group.items.length <= GROUP_PREVIEW) return group.items
  return group.items.slice(0, GROUP_PREVIEW)
}

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

/** 发布 / 下架团队共享模板（清单 026）。 */
async function togglePublish(tpl: KnowledgeTemplate, published: boolean) {
  try {
    await publishTemplate(projectId.value, tpl.id, published)
    tpl.published = published
    ElMessage.success(published ? '模板已发布，团队成员可见' : '模板已下架')
  } catch (err) {
    ElMessage.error(friendlyApiMessage(err, '操作失败'))
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

/** 卡片更多菜单的命令分发。 */
async function onCardCommand(tpl: KnowledgeTemplate, cmd: string) {
  if (cmd === 'publish') {
    await togglePublish(tpl, !tpl.published)
    return
  }
  if (cmd === 'props') {
    openProps(tpl)
    return
  }
  if (cmd === 'up') {
    await move(tpl, -1)
    return
  }
  if (cmd === 'down') {
    await move(tpl, 1)
    return
  }
  if (cmd === 'remove') {
    await remove(tpl)
    return
  }
  await changeScope(tpl, cmd)
}

onMounted(load)
</script>

<template>
  <div class="tpl-center">
    <header class="tpl-center__head">
      <button class="tpl-icon-btn" type="button" title="返回知识库" aria-label="返回知识库" @click="router.back()">
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <div class="tpl-center__title">
        <h2>模板中心</h2>
        <span class="tpl-center__count">{{ templates.length }} 套模板</span>
      </div>
      <div class="tpl-center__tools">
        <div class="tpl-seg" role="tablist" aria-label="模板作用域">
          <button
            v-for="opt in scopeOptions"
            :key="opt.value"
            type="button"
            class="tpl-seg__btn"
            :class="{ 'is-active': scope === opt.value }"
            :aria-pressed="scope === opt.value"
            @click="scope = opt.value"
          >
            <el-icon><component :is="opt.icon" /></el-icon>
            <span>{{ opt.label }}</span>
          </button>
        </div>
        <el-input v-model="keyword" class="tpl-search" placeholder="搜索模板名称" size="small" clearable>
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="category" class="tpl-cat" size="small">
          <el-option label="全部分类" value="all" />
          <el-option v-for="item in categories" :key="item" :label="item" :value="item" />
        </el-select>
      </div>
    </header>

    <nav class="tpl-chips" aria-label="模板分类">
      <button
        type="button"
        class="tpl-chip"
        :class="{ 'is-active': category === 'all' }"
        @click="category = 'all'"
      >全部分类</button>
      <button
        v-for="item in categories"
        :key="item"
        type="button"
        class="tpl-chip"
        :class="{ 'is-active': category === item }"
        @click="category = item"
      >
        <el-icon><component :is="categoryIcon(item)" /></el-icon>
        <span>{{ item }}</span>
      </button>
    </nav>

    <div v-if="loading" class="tpl-center__empty"><AppLoading /></div>
    <p v-else-if="!groups.length" class="tpl-center__empty">没有匹配的模板。</p>

    <section v-for="group in groups" :key="group.name" class="tpl-center__group">
      <h3 class="tpl-center__group-title">
        <el-icon><component :is="categoryIcon(group.name)" /></el-icon>
        <span>{{ group.name }}</span>
        <em class="tpl-center__group-count">{{ group.items.length }}</em>
      </h3>
      <div class="tpl-center__grid">
        <article v-for="tpl in visibleItems(group)" :key="tpl.id" class="tpl-card">
          <div class="tpl-card__icon" aria-hidden="true">{{ tpl.icon }}</div>
          <div class="tpl-card__body">
            <div class="tpl-card__title">{{ tpl.label }}</div>
            <div class="tpl-card__meta">
              <span class="tpl-badge" :class="{ 'is-builtin': tpl.builtin }">
                {{ scopeLabels[tpl.builtin ? 'builtin' : tpl.scope] ?? '个人' }}
              </span>
              <span v-if="tpl.scope === 'team'" class="tpl-badge" :class="{ 'is-live': tpl.published }">
                {{ tpl.published ? '已发布' : '未发布' }}
              </span>
              <span class="tpl-card__src">{{ tpl.builtin ? '系统内置' : '自定义模板' }}</span>
            </div>
          </div>
          <div class="tpl-card__ops">
            <button class="tpl-use-btn" type="button" @click="useTemplate(tpl)">
              <el-icon><DocumentAdd /></el-icon>
              <span>使用</span>
            </button>
            <el-dropdown v-if="!tpl.builtin" trigger="click" @command="(cmd: string) => onCardCommand(tpl, cmd)">
              <button class="tpl-more-btn" type="button" title="更多操作" aria-label="更多操作">
                <el-icon><MoreFilled /></el-icon>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="personal"><el-icon><DocumentAdd /></el-icon>仅自己</el-dropdown-item>
                  <el-dropdown-item command="team"><el-icon><Management /></el-icon>团队共享</el-dropdown-item>
                  <el-dropdown-item command="project"><el-icon><Grid /></el-icon>仅本项目</el-dropdown-item>
                  <el-dropdown-item command="publish" divided><el-icon><Promotion /></el-icon>{{ tpl.published ? '下架' : '发布' }}</el-dropdown-item>
                  <el-dropdown-item command="props"><el-icon><Setting /></el-icon>属性定义</el-dropdown-item>
                  <el-dropdown-item command="up"><el-icon><Top /></el-icon>上移</el-dropdown-item>
                  <el-dropdown-item command="down"><el-icon><Bottom /></el-icon>下移</el-dropdown-item>
                  <el-dropdown-item command="remove" divided><el-icon><Delete /></el-icon>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </article>
      </div>
      <button
        v-if="group.items.length > GROUP_PREVIEW"
        type="button"
        class="tpl-expand"
        @click="toggleGroup(group.name)"
      >
        {{ isExpanded(group.name) ? '收起' : `展开全部 ${group.items.length} 套` }}
      </button>
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
.tpl-center {
  padding: 18px 22px 40px;
  overflow: auto;
  height: 100%;
  box-sizing: border-box;
}
.tpl-center__head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
}
.tpl-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--mm-text, #1d2129);
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  transition: background-color 120ms ease, transform 120ms ease;
}
.tpl-icon-btn:hover {
  background: #fff;
  transform: translateY(-1px);
}
.tpl-center__title { display: flex; align-items: baseline; gap: 8px; }
.tpl-center__title h2 { margin: 0; font-size: 18px; font-weight: 600; color: var(--mm-text, #1d2129); }
.tpl-center__count {
  font-size: 12px;
  color: var(--mm-muted, #86909c);
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
}
.tpl-center__tools { display: flex; align-items: center; gap: 10px; margin-left: auto; flex-wrap: wrap; }
.tpl-seg {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
}
.tpl-seg__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #5b6675;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.tpl-seg__btn:hover { background: rgba(255, 255, 255, 0.72); color: #1d2129; }
.tpl-seg__btn.is-active {
  background: #fff;
  color: var(--el-color-primary, #165dff);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
}
.tpl-search { width: 200px; }
.tpl-cat { width: 130px; }

.tpl-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 14px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tpl-chips::-webkit-scrollbar { display: none; height: 0; }
.tpl-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.66);
  color: #5b6675;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}
.tpl-chip:hover { background: #fff; color: #1d2129; }
.tpl-chip.is-active {
  background: var(--el-color-primary, #165dff);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
}

.tpl-center__group { margin-bottom: 22px; }
.tpl-center__group-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 16px 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--mm-text, #1d2129);
}
.tpl-center__group-title .el-icon { color: var(--el-color-primary, #165dff); }
.tpl-center__group-count {
  font-style: normal;
  font-size: 11px;
  font-weight: 500;
  color: var(--mm-muted, #86909c);
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
}
.tpl-center__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(272px, 1fr));
  gap: 10px;
}
.tpl-card {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 14px;
  border: 1px solid rgba(15, 23, 42, 0.07);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
}
.tpl-card:hover {
  transform: translateY(-1px);
  border-color: rgba(22, 93, 255, 0.28);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}
.tpl-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: rgba(22, 93, 255, 0.08);
  font-size: 19px;
  line-height: 1;
}
.tpl-card__body { flex: 1; min-width: 0; }
.tpl-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--mm-text, #1d2129);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tpl-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--mm-muted, #86909c);
}
.tpl-badge {
  padding: 1px 7px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.06);
  color: #5b6675;
}
.tpl-badge.is-builtin { background: rgba(22, 93, 255, 0.1); color: #1456f0; }
.tpl-badge.is-live { background: rgba(16, 185, 129, 0.12); color: #0f8a5f; }
.tpl-card__src { color: var(--mm-muted, #86909c); }
.tpl-card__ops { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.tpl-use-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--el-color-primary, #165dff);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: filter 120ms ease, transform 120ms ease;
}
.tpl-use-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
.tpl-more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #5b6675;
  cursor: pointer;
}
.tpl-more-btn:hover { background: rgba(15, 23, 42, 0.06); color: #1d2129; }

.tpl-expand {
  display: block;
  margin: 10px auto 0;
  height: 30px;
  padding: 0 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #5b6675;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.tpl-expand:hover { background: #fff; color: var(--el-color-primary, #165dff); }

.tpl-center__empty { color: var(--mm-muted, #86909c); font-size: 13px; padding: 24px 0; }
.tpl-center__field { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
</style>
