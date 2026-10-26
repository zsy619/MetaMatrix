<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TemplateId } from '../stores/document'
import { TEMPLATE_META } from '../stores/document'
import { useAuthStore } from '../stores/auth'
import type { DocumentSummary, SearchHit } from '../api/documents'
import { listDocuments, searchDocuments } from '../api/documents'

interface GuideCard {
  id: TemplateId
  name: string
  description: string
}

const router = useRouter()
const auth = useAuthStore()
const recent = ref<DocumentSummary[]>([])
const searchQ = ref('')
const searchHits = ref<SearchHit[]>([])
const searching = ref(false)
const searchErr = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

const cards: GuideCard[] = (
  Object.keys(TEMPLATE_META) as TemplateId[]
).map((id) => ({
  id,
  name: TEMPLATE_META[id].name,
  description: TEMPLATE_META[id].description,
}))

function openCanvas(id: TemplateId) {
  router.push({ name: 'canvas', params: { templateId: id } })
}

function goLogin() {
  router.push({ name: 'login', query: { redirect: '/' } })
}

function goRegister() {
  router.push({ name: 'register', query: { redirect: '/' } })
}

function logout() {
  auth.logout()
  recent.value = []
}

async function refreshRecent() {
  if (!auth.isAuthenticated) {
    recent.value = []
    return
  }
  try {
    recent.value = (await listDocuments()).slice(0, 8)
  } catch {
    recent.value = []
  }
}

function openDoc(d: DocumentSummary) {
  const tid = d.templateId || 'dual-triangle'
  router.push({
    name: 'canvas',
    params: { templateId: tid },
    query: { documentId: d.id },
  })
}


async function runSearch() {
  searchErr.value = ''
  if (!auth.isAuthenticated) {
    searchHits.value = []
    return
  }
  const q = searchQ.value.trim()
  if (!q) {
    searchHits.value = []
    return
  }
  searching.value = true
  try {
    searchHits.value = await searchDocuments({ q, limit: 12 })
  } catch (e) {
    searchErr.value = e instanceof Error ? e.message : '搜索失败'
    searchHits.value = []
  } finally {
    searching.value = false
  }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void runSearch()
  }, 280)
}

function openHit(d: SearchHit) {
  const tid = d.templateId || 'dual-triangle'
  router.push({
    name: 'canvas',
    params: { templateId: tid },
    query: { documentId: d.id },
  })
}

onMounted(async () => {
  if (auth.token) await auth.fetchMe()
  await refreshRecent()
})
</script>

<template>
  <div class="guide">
    <header class="hero">
      <div class="hero-top">
        <p class="eyebrow">MetaMatrix</p>
        <div class="auth-bar">
          <template v-if="auth.isAuthenticated">
            <span class="who">{{ auth.user?.displayName || auth.user?.email }}</span>
            <button type="button" class="linkish" @click="logout">退出</button>
          </template>
          <template v-else>
            <button type="button" class="linkish" @click="goLogin">登录</button>
            <button type="button" class="primaryish" @click="goRegister">注册</button>
          </template>
        </div>
      </div>
      <h1>元矩阵 MetaMatrix</h1>
      <p class="lead">
        选择一张画布模板，开始结构化梳理与可视化表达。登录后可同步到服务端（多用户）。
      </p>
      <section v-if="auth.isAuthenticated" class="search-box" aria-label="搜索我的画布">
        <label class="search-label" for="guide-doc-search">搜索我的画布</label>
        <div class="search-row">
          <input
            id="guide-doc-search"
            v-model="searchQ"
            type="search"
            placeholder="输入关键词（标题或正文）…"
            autocomplete="off"
            @input="onSearchInput"
            @keydown.enter.prevent="runSearch"
          />
          <button type="button" class="primaryish" :disabled="searching" @click="runSearch">
            {{ searching ? '搜索中…' : '搜索' }}
          </button>
        </div>
        <p v-if="searchErr" class="search-err">{{ searchErr }}</p>
        <ul v-if="searchHits.length" class="search-hits">
          <li v-for="h in searchHits" :key="h.id">
            <button type="button" @click="openHit(h)">
              <strong>{{ h.title }}</strong>
              <span>{{ h.templateId || h.canvasType }} · {{ new Date(h.updatedAt).toLocaleString() }}</span>
              <em v-if="h.snippet">{{ h.snippet }}</em>
            </button>
          </li>
        </ul>
        <p v-else-if="searchQ.trim() && !searching" class="search-empty">无匹配文档</p>
      </section>
      <section v-if="auth.isAuthenticated && recent.length" class="recent" aria-label="最近文档">
        <h2>我的最近文档</h2>
        <ul>
          <li v-for="d in recent" :key="d.id">
            <button type="button" @click="openDoc(d)">
              <strong>{{ d.title }}</strong>
              <span>{{ d.templateId || d.canvasType }} · {{ new Date(d.updatedAt).toLocaleString() }}</span>
            </button>
          </li>
        </ul>
      </section>
    </header>

    <section class="grid" aria-label="画布模板">
      <button
        v-for="card in cards"
        :key="card.id"
        type="button"
        class="card"
        :class="`card--${card.id}`"
        @click="openCanvas(card.id)"
      >
        <div class="thumb" aria-hidden="true">
          <!-- 双三角 -->
          <svg
            v-if="card.id === 'dual-triangle'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#f5f5f4" />
            <polygon points="70,28 38,88 102,88" fill="#C4A574" opacity="0.9" />
            <polygon points="130,52 98,112 162,112" fill="#5BA8A0" opacity="0.9" />
            <path
              d="M88 58 C100 48, 112 68, 124 58"
              fill="none"
              stroke="#C75B5B"
              stroke-width="2.5"
              stroke-linecap="round"
            />
            <path
              d="M84 78 C98 92, 114 72, 128 86"
              fill="none"
              stroke="#C75B5B"
              stroke-width="2.5"
              stroke-linecap="round"
            />
            <circle cx="70" cy="68" r="4" fill="#fff" opacity="0.85" />
            <circle cx="130" cy="88" r="4" fill="#fff" opacity="0.85" />
          </svg>

          <!-- STAR 四象限 -->
          <svg
            v-else-if="card.id === 'star-quadrant'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#fcfcfc" />
            <rect x="16" y="14" width="80" height="52" rx="6" fill="#fce8e6" />
            <rect x="104" y="14" width="80" height="52" rx="6" fill="#e6f4ea" />
            <rect x="16" y="74" width="80" height="52" rx="6" fill="#e8f0fe" />
            <rect x="104" y="74" width="80" height="52" rx="6" fill="#fef7e0" />
            <text x="28" y="46" font-size="22" font-weight="700" fill="#e57373">S</text>
            <text x="116" y="46" font-size="22" font-weight="700" fill="#81c784">T</text>
            <text x="28" y="106" font-size="22" font-weight="700" fill="#64b5f6">A</text>
            <text x="116" y="106" font-size="22" font-weight="700" fill="#ffb74d">R</text>
            <line x1="100" y1="14" x2="100" y2="126" stroke="#dadce0" stroke-width="1.5" />
            <line x1="16" y1="70" x2="184" y2="70" stroke="#dadce0" stroke-width="1.5" />
          </svg>

          <!-- Y 模型：Y 形示意图 -->
          <svg
            v-else-if="card.id === 'y-model'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#ffffff" />
            <!-- Y arms -->
            <line x1="100" y1="72" x2="48" y2="28" stroke="#5f6368" stroke-width="2.2" />
            <line x1="100" y1="72" x2="152" y2="28" stroke="#5f6368" stroke-width="2.2" />
            <line x1="100" y1="72" x2="100" y2="108" stroke="#5f6368" stroke-width="2.2" />
            <!-- boxes -->
            <rect x="18" y="14" width="40" height="22" rx="3" fill="none" stroke="#9aa0a6" stroke-dasharray="3 2" />
            <rect x="142" y="14" width="40" height="22" rx="3" fill="none" stroke="#9aa0a6" stroke-dasharray="3 2" />
            <rect x="70" y="58" width="60" height="28" rx="4" fill="#fff" stroke="#e53935" stroke-width="1.6" />
            <text x="100" y="76" text-anchor="middle" font-size="11" font-weight="700" fill="#202124">认知</text>
            <rect x="72" y="108" width="56" height="18" rx="3" fill="none" stroke="#9aa0a6" stroke-dasharray="3 2" />
            <rect x="24" y="128" width="152" height="8" rx="2" fill="#eceff1" />
            <text x="36" y="28" font-size="8" fill="#5f6368">理论</text>
            <text x="154" y="28" font-size="8" fill="#5f6368">事实</text>
          </svg>

          <!-- 刻意练习：三角循环示意图 -->
          <svg
            v-else-if="card.id === 'deliberate-practice'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#f3f4f6" />
            <text x="100" y="22" text-anchor="middle" font-size="11" font-weight="800" fill="#F99D1C">前提：长期追求</text>
            <polygon
              points="100,38 168,118 32,118"
              fill="none"
              stroke="#c5c9ce"
              stroke-width="6"
              stroke-linejoin="round"
              opacity="0.7"
            />
            <circle cx="100" cy="44" r="10" fill="#2B7DE9" />
            <circle cx="160" cy="112" r="10" fill="#00A685" />
            <circle cx="40" cy="112" r="10" fill="#F99D1C" />
            <circle
              cx="100"
              cy="88"
              r="16"
              fill="none"
              stroke="#00A685"
              stroke-width="1.5"
              stroke-dasharray="3 2"
            />
            <text x="100" y="91" text-anchor="middle" font-size="8" font-weight="700" fill="#00A685">重复</text>
            <text x="100" y="36" text-anchor="middle" font-size="7" font-weight="700" fill="#2B7DE9">A</text>
            <text x="160" y="128" text-anchor="middle" font-size="7" font-weight="700" fill="#00A685">B</text>
            <text x="40" y="128" text-anchor="middle" font-size="7" font-weight="700" fill="#F99D1C">C</text>
          </svg>

          <!-- 需求评估三角形：雷达缩略图 -->
          <svg
            v-else-if="card.id === 'demand-triangle'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#f4f5f7" />
            <polygon points="100,22 168,118 32,118" fill="none" stroke="#9aa0a6" stroke-width="1.6" />
            <polygon points="100,40 148,108 52,108" fill="none" stroke="#c5c9ce" stroke-width="1.1" />
            <polygon points="100,58 128,98 72,98" fill="none" stroke="#c5c9ce" stroke-width="1.1" />
            <polygon points="100,34 158,112 42,112" fill="rgba(212,175,55,0.35)" stroke="#c9a227" stroke-width="1.2" />
            <polygon points="100,52 138,104 62,104" fill="rgba(129,199,132,0.4)" stroke="#66bb6a" stroke-width="1.2" />
            <polygon points="100,70 120,96 80,96" fill="rgba(77,182,172,0.45)" stroke="#26a69a" stroke-width="1.2" />
            <circle cx="18" cy="28" r="4" fill="#c9a227" />
            <circle cx="18" cy="44" r="4" fill="#66bb6a" />
            <circle cx="18" cy="60" r="4" fill="#26a69a" />
            <text x="100" y="16" text-anchor="middle" font-size="8" font-weight="700" fill="#5f6368">普遍性</text>
            <text x="28" y="132" text-anchor="middle" font-size="7" font-weight="700" fill="#5f6368">频次</text>
            <text x="172" y="132" text-anchor="middle" font-size="7" font-weight="700" fill="#5f6368">刚性</text>
          </svg>

          <!-- 五步法：五列黄头示意 -->
          <svg
            v-else-if="card.id === 'five-step'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#faf8f5" />
            <g font-size="7" font-weight="800" text-anchor="middle">
              <rect x="8" y="10" width="34" height="16" fill="#ffff00" stroke="#5f6368" stroke-width="0.8" />
              <text x="25" y="21" fill="#202124">需求</text>
              <rect x="44" y="10" width="34" height="16" fill="#ffff00" stroke="#5f6368" stroke-width="0.8" />
              <text x="61" y="21" fill="#202124">方案</text>
              <rect x="80" y="10" width="34" height="16" fill="#ffff00" stroke="#5f6368" stroke-width="0.8" />
              <text x="97" y="21" fill="#202124">模式</text>
              <rect x="116" y="10" width="34" height="16" fill="#ffff00" stroke="#5f6368" stroke-width="0.8" />
              <text x="133" y="21" fill="#202124">增长</text>
              <rect x="152" y="10" width="40" height="16" fill="#ffff00" stroke="#5f6368" stroke-width="0.8" />
              <text x="172" y="21" fill="#202124">壁垒</text>
            </g>
            <rect x="8" y="26" width="34" height="72" fill="#f5f2eb" stroke="#5f6368" stroke-width="0.6" />
            <rect x="44" y="26" width="34" height="72" fill="#f5f2eb" stroke="#5f6368" stroke-width="0.6" />
            <rect x="80" y="26" width="34" height="72" fill="#f5f2eb" stroke="#5f6368" stroke-width="0.6" />
            <rect x="116" y="26" width="34" height="72" fill="#f5f2eb" stroke="#5f6368" stroke-width="0.6" />
            <rect x="152" y="26" width="40" height="72" fill="#f5f2eb" stroke="#5f6368" stroke-width="0.6" />
            <line x1="8" y1="74" x2="192" y2="74" stroke="#5f6368" stroke-width="0.5" opacity="0.5" />
            <g font-size="5.5" font-weight="700" text-anchor="middle" fill="#5f6368">
              <rect x="8" y="100" width="34" height="18" fill="#eceae4" stroke="#5f6368" stroke-width="0.6" />
              <text x="25" y="111">逐级拆解</text>
              <rect x="44" y="100" width="34" height="18" fill="#eceae4" stroke="#5f6368" stroke-width="0.6" />
              <text x="61" y="111">全局预判</text>
              <rect x="80" y="100" width="34" height="18" fill="#eceae4" stroke="#5f6368" stroke-width="0.6" />
              <text x="97" y="111">专业选项</text>
              <rect x="116" y="100" width="34" height="18" fill="#eceae4" stroke="#5f6368" stroke-width="0.6" />
              <text x="133" y="111">努力定量</text>
              <rect x="152" y="100" width="40" height="18" fill="#eceae4" stroke="#5f6368" stroke-width="0.6" />
              <text x="172" y="111">动态更新</text>
            </g>
          </svg>

          <!-- AI场景取舍评估：2×4 网格示意 -->
          <svg
            v-else-if="card.id === 'ai-tradeoff'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#ffffff" />
            <text x="100" y="16" text-anchor="middle" font-size="9" font-weight="800" fill="#202124">AI场景取舍评估</text>
            <rect x="12" y="24" width="86" height="14" fill="#e8eaed" stroke="#dadce0" stroke-width="0.6" />
            <rect x="102" y="24" width="86" height="14" fill="#e8eaed" stroke="#dadce0" stroke-width="0.6" />
            <text x="55" y="34" text-anchor="middle" font-size="6.5" font-weight="700" fill="#3c4043">价值侧</text>
            <text x="145" y="34" text-anchor="middle" font-size="6.5" font-weight="700" fill="#3c4043">成本侧</text>
            <g font-size="6" font-weight="800" fill="#d93025">
              <rect x="12" y="38" width="86" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.6" />
              <text x="18" y="50">A1.价值差异</text>
              <rect x="102" y="38" width="86" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.6" />
              <text x="108" y="50">B1.容错高低</text>
              <rect x="12" y="60" width="86" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.6" />
              <text x="18" y="72">A2.复现频率</text>
              <rect x="102" y="60" width="86" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.6" />
              <text x="108" y="72">B2.流程清晰</text>
              <rect x="12" y="82" width="86" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.6" />
              <text x="18" y="94">A3.规模卡点</text>
              <rect x="102" y="82" width="86" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.6" />
              <text x="108" y="94">B3.决策明确</text>
              <rect x="12" y="104" width="86" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.6" />
              <text x="18" y="116">A4.核心能力</text>
              <rect x="102" y="104" width="86" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.6" />
              <text x="108" y="116">B4.数据可行</text>
            </g>
            <text x="188" y="134" text-anchor="end" font-size="5.5" fill="#80868b">1-10分 · 事实论证</text>
          </svg>

          <!-- 产品内核画布：2+3 黄头网格 -->
          <svg
            v-else-if="card.id === 'product-content'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#ffffff" />
            <rect x="10" y="10" width="88" height="14" fill="#ffff00" stroke="#9aa0a6" stroke-width="0.7" />
            <rect x="102" y="10" width="88" height="14" fill="#ffff00" stroke="#9aa0a6" stroke-width="0.7" />
            <text x="54" y="20" text-anchor="middle" font-size="7" font-weight="800" fill="#202124">用户</text>
            <text x="146" y="20" text-anchor="middle" font-size="7" font-weight="800" fill="#202124">核心指标</text>
            <rect x="10" y="24" width="88" height="28" fill="#fff" stroke="#9aa0a6" stroke-width="0.6" />
            <rect x="102" y="24" width="88" height="28" fill="#fff" stroke="#9aa0a6" stroke-width="0.6" />
            <rect x="10" y="58" width="58" height="14" fill="#ffff00" stroke="#9aa0a6" stroke-width="0.7" />
            <rect x="71" y="58" width="58" height="14" fill="#ffff00" stroke="#9aa0a6" stroke-width="0.7" />
            <rect x="132" y="58" width="58" height="14" fill="#ffff00" stroke="#9aa0a6" stroke-width="0.7" />
            <text x="39" y="68" text-anchor="middle" font-size="5.5" font-weight="800" fill="#202124">加法</text>
            <text x="100" y="68" text-anchor="middle" font-size="5.5" font-weight="800" fill="#202124">减法</text>
            <text x="161" y="68" text-anchor="middle" font-size="5.5" font-weight="800" fill="#202124">验证</text>
            <rect x="10" y="72" width="58" height="56" fill="#fff" stroke="#9aa0a6" stroke-width="0.6" />
            <rect x="71" y="72" width="58" height="56" fill="#fff" stroke="#9aa0a6" stroke-width="0.6" />
            <rect x="132" y="72" width="58" height="56" fill="#fff" stroke="#9aa0a6" stroke-width="0.6" />
          </svg>

          <!-- OSCAR调研：3+2 网格示意 -->
          <svg
            v-else-if="card.id === 'oscar'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#f5f0e8" />
            <rect x="10" y="12" width="58" height="52" fill="#f5f0e8" stroke="#202124" stroke-width="1.2" />
            <rect x="71" y="12" width="58" height="52" fill="#f5f0e8" stroke="#202124" stroke-width="1.2" />
            <rect x="132" y="12" width="58" height="52" fill="#f5f0e8" stroke="#202124" stroke-width="1.2" />
            <text x="18" y="28" font-size="8" font-weight="800" fill="#202124">O 目标</text>
            <text x="79" y="28" font-size="8" font-weight="800" fill="#202124">S 范围</text>
            <text x="140" y="28" font-size="8" font-weight="800" fill="#202124">C 清单</text>
            <text x="14" y="58" font-size="22" font-weight="800" fill="rgba(100,149,237,0.28)">O</text>
            <text x="75" y="58" font-size="22" font-weight="800" fill="rgba(100,149,237,0.28)">S</text>
            <text x="136" y="58" font-size="22" font-weight="800" fill="rgba(100,149,237,0.28)">C</text>
            <rect x="10" y="70" width="88" height="58" fill="#f5f0e8" stroke="#202124" stroke-width="1.2" />
            <rect x="102" y="70" width="88" height="58" fill="#f5f0e8" stroke="#202124" stroke-width="1.2" />
            <text x="18" y="88" font-size="8" font-weight="800" fill="#202124">A 获取</text>
            <text x="110" y="88" font-size="8" font-weight="800" fill="#202124">R 用好</text>
            <text x="14" y="122" font-size="22" font-weight="800" fill="rgba(100,149,237,0.28)">A</text>
            <text x="106" y="122" font-size="22" font-weight="800" fill="rgba(100,149,237,0.28)">R</text>
          </svg>

          <!-- 行业分析：3顶 + 3全宽行 -->
          <svg
            v-else-if="card.id === 'industry-analysis'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#ffffff" />
            <rect x="10" y="10" width="58" height="36" fill="#fff" stroke="#202124" stroke-width="1.1" />
            <rect x="71" y="10" width="58" height="36" fill="#fff" stroke="#202124" stroke-width="1.1" />
            <rect x="132" y="10" width="58" height="36" fill="#fff" stroke="#202124" stroke-width="1.1" />
            <text x="14" y="24" font-size="6.5" font-weight="800" fill="#202124">拆解产业链</text>
            <text x="75" y="24" font-size="6.5" font-weight="800" fill="#202124">洞察变化</text>
            <text x="136" y="24" font-size="6.5" font-weight="800" fill="#202124">稳态B点</text>
            <rect x="10" y="52" width="180" height="24" fill="#fff" stroke="#202124" stroke-width="1.1" />
            <text x="16" y="67" font-size="7" font-weight="800" fill="#202124">判断行业周期</text>
            <rect x="10" y="82" width="180" height="24" fill="#fff" stroke="#202124" stroke-width="1.1" />
            <text x="16" y="97" font-size="7" font-weight="800" fill="#202124">行业天花板大小</text>
            <rect x="10" y="112" width="180" height="20" fill="#fff" stroke="#202124" stroke-width="1.1" />
            <text x="16" y="125" font-size="7" font-weight="800" fill="#202124">行业集中度</text>
          </svg>

          <!-- 关键阻力：黄头 + 三列表格 -->
          <svg
            v-else-if="card.id === 'key-resistance'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#ffffff" />
            <rect x="10" y="8" width="180" height="18" fill="#fff9c4" stroke="#e0e0e0" stroke-width="0.6" />
            <text x="100" y="20" text-anchor="middle" font-size="7" font-weight="700" fill="#202124">关键阻力分析画布：____率</text>
            <rect x="10" y="28" width="58" height="12" fill="#f5f0e6" stroke="#dadce0" stroke-width="0.5" />
            <rect x="71" y="28" width="58" height="12" fill="#f5f0e6" stroke="#dadce0" stroke-width="0.5" />
            <rect x="132" y="28" width="58" height="12" fill="#f5f0e6" stroke="#dadce0" stroke-width="0.5" />
            <text x="39" y="36.5" text-anchor="middle" font-size="5.5" font-weight="700" fill="#3c4043">阻力假设</text>
            <text x="100" y="36.5" text-anchor="middle" font-size="5.5" font-weight="700" fill="#3c4043">消除假设</text>
            <text x="161" y="36.5" text-anchor="middle" font-size="5" font-weight="700" fill="#3c4043">备注/策略</text>
            <rect x="10" y="40" width="58" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="71" y="40" width="58" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="132" y="40" width="58" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="10" y="62" width="58" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="71" y="62" width="58" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="132" y="62" width="58" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="10" y="84" width="58" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="71" y="84" width="58" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="132" y="84" width="58" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <text x="16" y="122" font-size="5.5" fill="#c75b3a">消除深度：降低 &lt; 消除 &lt; 逆转</text>
            <text x="16" y="132" font-size="5.5" fill="#c75b3a">消除成本：动嘴 &lt; 动手 &lt; 动钱</text>
          </svg>

          <!-- 转化率取舍：浅黄头 + 四列表格 -->
          <svg
            v-else-if="card.id === 'conversion-tradeoff'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#ffffff" />
            <rect x="10" y="8" width="180" height="18" fill="#fff8e1" stroke="#e0e0e0" stroke-width="0.6" />
            <text x="100" y="20" text-anchor="middle" font-size="6.5" font-weight="800" fill="#202124">一堂最佳转化率分析画布·取舍版</text>
            <rect x="10" y="28" width="36" height="12" fill="#fff8e1" stroke="#dadce0" stroke-width="0.5" />
            <rect x="48" y="28" width="46" height="12" fill="#fff8e1" stroke="#dadce0" stroke-width="0.5" />
            <rect x="96" y="28" width="46" height="12" fill="#fff8e1" stroke="#dadce0" stroke-width="0.5" />
            <rect x="144" y="28" width="46" height="12" fill="#fff8e1" stroke="#dadce0" stroke-width="0.5" />
            <text x="28" y="36.5" text-anchor="middle" font-size="5.5" font-weight="700" fill="#202124">优先级</text>
            <text x="71" y="36.5" text-anchor="middle" font-size="5.5" font-weight="700" fill="#202124">动力</text>
            <text x="119" y="36.5" text-anchor="middle" font-size="5.5" font-weight="700" fill="#202124">阻力</text>
            <text x="167" y="36.5" text-anchor="middle" font-size="5.5" font-weight="700" fill="#202124">触点</text>
            <rect x="10" y="40" width="36" height="28" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="48" y="40" width="46" height="28" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="96" y="40" width="46" height="28" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="144" y="40" width="46" height="28" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <text x="28" y="57" text-anchor="middle" font-size="6" font-weight="800" fill="#202124">Top3</text>
            <rect x="10" y="68" width="36" height="28" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="48" y="68" width="46" height="28" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="96" y="68" width="46" height="28" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="144" y="68" width="46" height="28" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <text x="28" y="85" text-anchor="middle" font-size="5.5" font-weight="700" fill="#202124">其他备选</text>
            <text x="100" y="122" text-anchor="middle" font-size="6" fill="#9aa0a6">+ 添加行</text>
          </svg>

          <!-- 行业预判：棕头 + 3顶 + 3全宽 -->
          <svg
            v-else-if="card.id === 'industry-forecast'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#ffffff" />
            <rect x="10" y="8" width="180" height="16" fill="#c4a574" stroke="#8d6e4a" stroke-width="0.7" />
            <text x="100" y="19" text-anchor="middle" font-size="7" font-weight="800" fill="#3e2723">行业预判分析框架</text>
            <rect x="10" y="28" width="58" height="28" fill="#fff" stroke="#5d4037" stroke-width="1" />
            <rect x="71" y="28" width="58" height="28" fill="#fff" stroke="#5d4037" stroke-width="1" />
            <rect x="132" y="28" width="58" height="28" fill="#fff" stroke="#5d4037" stroke-width="1" />
            <text x="14" y="40" font-size="5.5" font-weight="800" fill="#202124">1.拆解产业链</text>
            <text x="75" y="40" font-size="5.5" font-weight="800" fill="#202124">2.洞察变化</text>
            <text x="136" y="40" font-size="5.5" font-weight="800" fill="#202124">3.稳态B点</text>
            <rect x="10" y="60" width="180" height="20" fill="#fff" stroke="#5d4037" stroke-width="1" />
            <text x="16" y="73" font-size="6.5" font-weight="800" fill="#202124">4.判断行业周期</text>
            <rect x="10" y="84" width="180" height="20" fill="#fff" stroke="#5d4037" stroke-width="1" />
            <text x="16" y="97" font-size="6.5" font-weight="800" fill="#202124">5.行业天花板大小</text>
            <rect x="10" y="108" width="180" height="20" fill="#fff" stroke="#5d4037" stroke-width="1" />
            <text x="16" y="121" font-size="6.5" font-weight="800" fill="#202124">6.行业集中度</text>
          </svg>

          <!-- 科学开会：三栏浅黄 -->
          <svg
            v-else-if="card.id === 'scientific-meeting'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#fffde7" />
            <rect x="10" y="10" width="58" height="100" fill="#fffde7" stroke="#c9a227" stroke-width="1.1" />
            <rect x="71" y="10" width="58" height="100" fill="#fffde7" stroke="#c9a227" stroke-width="1.1" />
            <rect x="132" y="10" width="58" height="100" fill="#fffde7" stroke="#c9a227" stroke-width="1.1" />
            <text x="14" y="24" font-size="6.5" font-weight="800" fill="#202124">Step1 目标</text>
            <text x="75" y="24" font-size="6.5" font-weight="800" fill="#202124">Step2 原则</text>
            <text x="136" y="24" font-size="6.5" font-weight="800" fill="#202124">Step3 流程</text>
            <rect x="14" y="30" width="50" height="36" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="75" y="30" width="50" height="72" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="136" y="30" width="50" height="36" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="14" y="72" width="50" height="30" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <rect x="136" y="72" width="50" height="30" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <text x="16" y="84" font-size="4.5" fill="#80868b">不开会的问题</text>
            <text x="138" y="84" font-size="4.5" fill="#80868b">效率手段</text>
            <rect x="10" y="116" width="180" height="14" fill="#fff8e1" stroke="#c9a227" stroke-width="0.8" />
            <text x="16" y="125" font-size="5.5" fill="#3c4043">会议类型：____　梳理人：____</text>
          </svg>

          <!-- IPO：I→P→O + 反馈闭环 -->
          <svg
            v-else-if="card.id === 'ipo'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#f7f5f0" />
            <!-- Goal -->
            <rect x="118" y="8" width="42" height="16" fill="none" stroke="#9aa0a6" stroke-width="0.9" stroke-dasharray="2 1.5" />
            <text x="164" y="19" font-size="7" font-weight="800" fill="#202124">目标</text>
            <line x1="148" y1="26" x2="148" y2="34" stroke="#202124" stroke-width="1" marker-end="url(#ipo-t-b)" />
            <!-- I P O boxes -->
            <rect x="18" y="42" width="40" height="36" fill="#fff" stroke="#9aa0a6" stroke-width="1" stroke-dasharray="2.5 1.5" />
            <rect x="80" y="42" width="40" height="36" fill="#fff" stroke="#9aa0a6" stroke-width="1" stroke-dasharray="2.5 1.5" />
            <rect x="142" y="42" width="40" height="36" fill="#fff" stroke="#9aa0a6" stroke-width="1" stroke-dasharray="2.5 1.5" />
            <text x="22" y="38" font-size="7.5" font-weight="800" fill="#d32f2f">输入</text>
            <text x="84" y="38" font-size="7.5" font-weight="800" fill="#d32f2f">处理</text>
            <text x="146" y="38" font-size="7.5" font-weight="800" fill="#d32f2f">输出</text>
            <!-- red arrows I→P→O -->
            <defs>
              <marker id="ipo-t-r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0 1.5 L9 5 L0 8.5 z" fill="#d32f2f" />
              </marker>
              <marker id="ipo-t-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                <path d="M0 1.5 L9 5 L0 8.5 z" fill="#202124" />
              </marker>
            </defs>
            <line x1="60" y1="60" x2="76" y2="60" stroke="#d32f2f" stroke-width="1.6" marker-end="url(#ipo-t-r)" />
            <line x1="122" y1="60" x2="138" y2="60" stroke="#d32f2f" stroke-width="1.6" marker-end="url(#ipo-t-r)" />
            <!-- Pattern -->
            <line x1="100" y1="80" x2="100" y2="90" stroke="#202124" stroke-width="1" />
            <text x="88" y="100" font-size="6.5" font-weight="800" fill="#202124">模型</text>
            <rect x="80" y="104" width="40" height="14" fill="#fff" stroke="#9aa0a6" stroke-width="0.9" stroke-dasharray="2 1.5" />
            <!-- Feedback -->
            <text x="48" y="130" font-size="6.5" font-weight="800" fill="#202124">反馈</text>
            <rect x="68" y="121" width="70" height="12" fill="#fff" stroke="#9aa0a6" stroke-width="0.9" stroke-dasharray="2 1.5" />
            <!-- feedback loop -->
            <path d="M162 80 L162 134 L28 134 L28 80" fill="none" stroke="#d32f2f" stroke-width="2.2" stroke-linejoin="round" marker-end="url(#ipo-t-r)" />
          </svg>

          <!-- 故障复盘：纵向七段文档 -->
          <svg
            v-else-if="card.id === 'incident-review'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#ffffff" />
            <text x="12" y="16" font-size="7.5" font-weight="800" fill="#202124">Case Study: 故障复盘</text>
            <line x1="12" y1="20" x2="188" y2="20" stroke="#e8eaed" stroke-width="0.8" />
            <text x="12" y="32" font-size="5.5" font-weight="700" fill="#202124">1.详细描述</text>
            <rect x="12" y="35" width="176" height="10" fill="#fafafa" stroke="#dadce0" stroke-width="0.5" />
            <text x="12" y="54" font-size="5.5" font-weight="700" fill="#202124">2.发生过程</text>
            <rect x="12" y="57" width="50" height="22" fill="#f1f3f4" stroke="#dadce0" stroke-width="0.5" />
            <rect x="62" y="57" width="126" height="22" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
            <text x="16" y="70" font-size="4.5" fill="#5f6368">时间</text>
            <text x="68" y="70" font-size="4.5" fill="#5f6368">行为</text>
            <text x="12" y="90" font-size="5.5" font-weight="700" fill="#202124">3.原因 · 4.方案</text>
            <rect x="12" y="93" width="176" height="8" fill="#fff8e1" stroke="#ffe082" stroke-width="0.5" />
            <text x="12" y="112" font-size="5.5" font-weight="700" fill="#202124">5.影响 · 6.需求 · 7.反思</text>
            <rect x="12" y="115" width="176" height="14" fill="#fce8e6" stroke="#f5c6c2" stroke-width="0.5" />
          </svg>



          <!-- 个人年度工作总结：三节纵向 -->
          <svg
            v-else-if="card.id === 'annual-summary'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#ffffff" />
            <text x="12" y="16" font-size="7" font-weight="800" fill="#202124">个人年度工作总结模板</text>
            <text x="12" y="34" font-size="6.5" font-weight="800" fill="#202124">重点业务进展</text>
            <line x1="12" y1="40" x2="12" y2="52" stroke="#dadce0" stroke-width="1.5" />
            <text x="18" y="48" font-size="5" font-style="italic" fill="#9aa0a6">TOP3 关键进展…</text>
            <rect x="12" y="54" width="176" height="14" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
            <text x="12" y="82" font-size="6.5" font-weight="800" fill="#202124">个人成长进步</text>
            <line x1="12" y1="88" x2="12" y2="98" stroke="#dadce0" stroke-width="1.5" />
            <rect x="12" y="100" width="176" height="10" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
            <text x="12" y="124" font-size="6.5" font-weight="800" fill="#202124">不足与改进计划</text>
            <rect x="12" y="128" width="176" height="6" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
          </svg>

          <!-- 深度复盘关键成果：网格 -->
          <svg
            v-else-if="card.id === 'deep-review'"
            class="thumb-svg"
            viewBox="0 0 200 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="200" height="140" rx="10" fill="#ffffff" />
            <rect x="8" y="8" width="184" height="16" fill="#fff8e1" stroke="#202124" stroke-width="1" />
            <text x="14" y="19" font-size="5.5" font-weight="700" fill="#202124">项目名称：____　复盘时间：____</text>
            <rect x="8" y="24" width="184" height="22" fill="#fff" stroke="#202124" stroke-width="1" />
            <text x="14" y="34" font-size="6" font-weight="800" fill="#202124">整体评价</text>
            <rect x="8" y="46" width="92" height="28" fill="#fff" stroke="#202124" stroke-width="1" />
            <rect x="100" y="46" width="92" height="28" fill="#fff" stroke="#202124" stroke-width="1" />
            <text x="14" y="58" font-size="6" font-weight="800" fill="#202124">亮点共识</text>
            <text x="106" y="58" font-size="6" font-weight="800" fill="#202124">问题共识</text>
            <rect x="8" y="74" width="61" height="28" fill="#fff" stroke="#202124" stroke-width="1" />
            <rect x="69" y="74" width="61" height="28" fill="#fff" stroke="#202124" stroke-width="1" />
            <rect x="130" y="74" width="62" height="28" fill="#fff" stroke="#202124" stroke-width="1" />
            <text x="14" y="86" font-size="5.5" font-weight="800" fill="#202124">坚持做</text>
            <text x="75" y="86" font-size="5.5" font-weight="800" fill="#202124">放弃做</text>
            <text x="136" y="86" font-size="5.5" font-weight="800" fill="#202124">新任务</text>
            <rect x="8" y="102" width="184" height="28" fill="#fff" stroke="#202124" stroke-width="1" />
            <text x="14" y="114" font-size="6" font-weight="800" fill="#202124">过程资产</text>
          </svg>


        </div>

        <div class="body">
          <h2>{{ card.name }}</h2>
          <p>{{ card.description }}</p>
          <span class="cta">进入画布 →</span>
        </div>
      </button>
    </section>
  </div>
</template>

<style scoped>
.guide {
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 48px 24px 56px;
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, #e8f0fe 0%, transparent 55%),
    #f8f9fa;
}

.hero {
  max-width: 720px;
  margin: 0 auto 36px;
  text-align: center;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #1a73e8;
  font-weight: 600;
}

.hero h1 {
  margin: 0 0 12px;
  font-size: clamp(28px, 4vw, 36px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #202124;
}

.lead {
  margin: 0;
  font-size: 16px;
  color: #5f6368;
  line-height: 1.6;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto;
}

.card {
  display: flex;
  flex-direction: column;
  text-align: left;
  padding: 0;
  border: 1px solid #dadce0;
  border-radius: 16px;
  background: #fff;
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
  font: inherit;
  color: inherit;
}

.card:hover,
.card:focus-visible {
  transform: translateY(-3px);
  border-color: #bdc1c6;
  box-shadow: 0 10px 28px rgba(32, 33, 36, 0.1);
  outline: none;
}

.card--dual-triangle:hover,
.card--dual-triangle:focus-visible {
  border-color: #C4A574;
}

.card--star-quadrant:hover,
.card--star-quadrant:focus-visible {
  border-color: #e57373;
}

.card--y-model:hover,
.card--y-model:focus-visible {
  border-color: #e53935;
}

.card--deliberate-practice:hover,
.card--deliberate-practice:focus-visible {
  border-color: #F99D1C;
}

.card--demand-triangle:hover,
.card--demand-triangle:focus-visible {
  border-color: #26a69a;
}

.card--five-step:hover,
.card--five-step:focus-visible {
  border-color: #f9a825;
}

.card--ai-tradeoff:hover,
.card--ai-tradeoff:focus-visible {
  border-color: #d93025;
}

.card--product-content:hover,
.card--product-content:focus-visible {
  border-color: #f9a825;
}

.card--oscar:hover,
.card--oscar:focus-visible {
  border-color: #6495ed;
}

.card--industry-analysis:hover,
.card--industry-analysis:focus-visible {
  border-color: #202124;
}

.card--key-resistance:hover,
.card--key-resistance:focus-visible {
  border-color: #f9a825;
}

.card--conversion-tradeoff:hover,
.card--conversion-tradeoff:focus-visible {
  border-color: #fbc02d;
}

.card--industry-forecast:hover,
.card--industry-forecast:focus-visible {
  border-color: #c4a574;
}

.card--scientific-meeting:hover,
.card--scientific-meeting:focus-visible {
  border-color: #c9a227;
}

.card--ipo:hover,
.card--ipo:focus-visible {
  border-color: #d32f2f;
}

.card--incident-review:hover,
.card--incident-review:focus-visible {
  border-color: #d93025;
}

.card--annual-summary:hover,
.card--annual-summary:focus-visible {
  border-color: #5f6368;
}

.card--deep-review:hover,
.card--deep-review:focus-visible {
  border-color: #c9a227;
}

.thumb {
  aspect-ratio: 200 / 140;
  background: #f1f3f4;
  border-bottom: 1px solid #eee;
}

.thumb-svg {
  display: block;
  width: 100%;
  height: 100%;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 18px 20px;
}

.body h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  color: #202124;
}

.body p {
  margin: 0;
  flex: 1;
  font-size: 13.5px;
  line-height: 1.55;
  color: #5f6368;
}

.cta {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #1a73e8;
}

.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: min(1100px, 100%);
  margin: 0 auto 8px;
}
.auth-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.who {
  font-size: 13px;
  color: #3c4043;
}
.linkish,
.primaryish {
  border: 1px solid #dadce0;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.primaryish {
  background: #1a73e8;
  border-color: #1a73e8;
  color: #fff;
}

.search-box {
  width: min(1100px, 100%);
  margin: 18px auto 0;
  text-align: left;
}
.search-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #3c4043;
  margin-bottom: 8px;
}
.search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.search-row input {
  flex: 1;
  border: 1px solid #dadce0;
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 14px;
  outline: none;
}
.search-row input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}
.search-err {
  color: #d93025;
  font-size: 13px;
  margin: 8px 0 0;
}
.search-empty {
  color: #5f6368;
  font-size: 13px;
  margin: 8px 0 0;
}
.search-hits {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}
.search-hits button {
  width: 100%;
  text-align: left;
  border: 1px solid #dadce0;
  border-radius: 10px;
  background: #fff;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.search-hits em {
  font-style: normal;
  font-size: 12px;
  color: #5f6368;
  line-height: 1.4;
  max-height: 3.2em;
  overflow: hidden;
}
.recent {
  width: min(1100px, 100%);
  margin: 20px auto 0;
  text-align: left;
}
.recent h2 {
  font-size: 16px;
  margin: 0 0 10px;
}
.recent ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.recent button {
  width: 100%;
  text-align: left;
  border: 1px solid #dadce0;
  border-radius: 10px;
  background: #fff;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.recent span {
  font-size: 12px;
  color: #5f6368;
}
</style>
