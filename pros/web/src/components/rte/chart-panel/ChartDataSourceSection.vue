<script setup lang="ts">
/**
 * 数据接口区块：地址、方法、请求体 / 参数、刷新间隔、字段映射、鉴权。
 *
 * 密钥不写进文档：
 * - 「读取本系统登录态」直接用系统已登录的 token（api/http.ts 的 getToken）；
 * - 「自定义」的 Bearer Token / Header 值存在浏览器本地（utils/echarts/chartSecret.ts），
 *   因此不会出现在导出 / 打印的 HTML 明文里。
 */
import { computed, ref, watch } from 'vue'
import type { useChartPanel } from './useChartPanel'
import {
  createEmptyDataSourceConfig,
  normalizeDataSourceConfig,
  parseDataSourceConfig,
  type ChartDataSourceAuth,
  type ChartDataSourceMethod,
} from '../../../utils/echarts/chartDataSource'
import { buildDataSourceRequest } from '../../../utils/echarts/chartDataRequest'
import { getToken } from '../../../api/http'

const props = defineProps<{ panel: ReturnType<typeof useChartPanel> }>()

const emit = defineEmits<{
  (e: 'update-config', config: ReturnType<typeof normalizeDataSourceConfig>): void
  (e: 'update-secret', secret: { bearerToken: string; headers: Record<string, string> }): void
}>()

const config = ref(normalizeDataSourceConfig(parseDataSourceConfig(props.panel.target?.dataSource)))
const bearerToken = ref('')
const headerKey = ref('')
const headerValue = ref('')
const message = ref('')

const authOptions: Array<{ value: ChartDataSourceAuth; label: string }> = [
  { value: 'none', label: '无鉴权' },
  { value: 'custom', label: '自定义（Header / Bearer Token）' },
  { value: 'session', label: '读取本系统登录态' },
]

const hasSessionToken = computed(() => !!getToken())

watch(
  () => props.panel.target?.chartId,
  () => {
    config.value = normalizeDataSourceConfig(parseDataSourceConfig(props.panel.target?.dataSource))
    message.value = ''
  },
)

function patch(next: Partial<typeof config.value>) {
  config.value = { ...config.value, ...next }
  emit('update-config', config.value)
}

function patchMapping(key: 'listPath' | 'categoryField' | 'valueField' | 'seriesField', value: string) {
  config.value = {
    ...config.value,
    mapping: { ...config.value.mapping, [key]: value },
  }
  emit('update-config', config.value)
}

function onMethod(event: Event) {
  patch({ method: (event.target as HTMLSelectElement).value as ChartDataSourceMethod })
}

function onAuth(event: Event) {
  patch({ auth: (event.target as HTMLSelectElement).value as ChartDataSourceAuth })
}

/** 预览将要发出的请求（密钥用 *** 代替，不回显明文）。 */
function previewRequest() {
  const request = buildDataSourceRequest(
    config.value,
    { bearerToken: '***', headers: headerKey.value.trim() ? { [headerKey.value.trim()]: '***' } : {} },
    hasSessionToken.value ? '***' : null,
  )
  message.value = [
    `${request.method} ${request.url}`,
    `请求头：${Object.keys(request.headers).join('、') || '无'}`,
    request.body ? `请求体：${request.body}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** 把自定义密钥交给上层（存本地，不进文档）。 */
function saveSecret() {
  const headers: Record<string, string> = {}
  if (headerKey.value.trim()) headers[headerKey.value.trim()] = headerValue.value
  emit('update-secret', { bearerToken: bearerToken.value, headers })
  message.value = '密钥已保存到本地（不会写进文档 / 导出 HTML）'
}

function resetConfig() {
  config.value = createEmptyDataSourceConfig()
  emit('update-config', config.value)
  message.value = ''
}
</script>

<template>
  <div class="rte-cp-section">
    <h4 class="rte-cp-section-title">数据接口</h4>
    <label class="rte-cp-field">
      <span class="rte-cp-field-label">启用接口拉取</span>
      <input
        type="checkbox"
        :checked="config.enabled"
        title="勾上后按下面的地址拉数据"
        @change="(e) => patch({ enabled: (e.target as HTMLInputElement).checked })"
      />
    </label>
    <label class="rte-cp-field">
      <span class="rte-cp-field-label">请求地址</span>
      <input
        class="rte-cp-input"
        type="text"
        placeholder="https://example.com/api/data"
        title="接口地址，图表会向这里拉数据"
        :value="config.url"
        @change="(e) => patch({ url: (e.target as HTMLInputElement).value })"
      />
    </label>
    <label class="rte-cp-field">
      <span class="rte-cp-field-label">请求方法</span>
      <select class="rte-cp-input" :value="config.method" title="GET 把参数放在地址上，POST 放在请求体里" @change="onMethod">
        <option value="GET">GET</option>
        <option value="POST">POST</option>
      </select>
    </label>
    <label class="rte-cp-field">
      <span class="rte-cp-field-label">Query 参数（JSON）</span>
      <textarea
        class="rte-cp-textarea"
        rows="2"
        placeholder='{"page":1}'
        title="拼到地址后面的参数，要写成 JSON"
        :value="config.params"
        @change="(e) => patch({ params: (e.target as HTMLTextAreaElement).value })"
      ></textarea>
    </label>
    <label class="rte-cp-field">
      <span class="rte-cp-field-label">请求体（JSON）</span>
      <textarea
        class="rte-cp-textarea"
        rows="2"
        placeholder='{"date":"2024-01"}'
        title="POST 时发出去的 JSON"
        :value="config.body"
        @change="(e) => patch({ body: (e.target as HTMLTextAreaElement).value })"
      ></textarea>
    </label>
    <label class="rte-cp-field">
      <span class="rte-cp-field-label">刷新间隔（秒，0 = 不刷新）</span>
      <input
        class="rte-cp-input"
        type="number"
        min="0"
        max="86400"
        title="隔多少秒再拉一次。0 表示不自动刷新，最多一天"
        :value="config.refreshInterval"
        @change="(e) => patch({ refreshInterval: Number((e.target as HTMLInputElement).value) || 0 })"
      />
    </label>

    <div class="rte-cp-sub">
      <div class="rte-cp-sub-title">字段映射（响应 → 图表）</div>
      <label class="rte-cp-field">
        <span class="rte-cp-field-label">数组路径</span>
        <input
          class="rte-cp-input"
          type="text"
          placeholder="data.list"
          title="响应里数组所在的路径，例如 data.list"
          :value="config.mapping.listPath"
          @change="(e) => patchMapping('listPath', (e.target as HTMLInputElement).value)"
        />
      </label>
      <label class="rte-cp-field">
        <span class="rte-cp-field-label">类目字段</span>
        <input
          class="rte-cp-input"
          type="text"
          placeholder="name"
          title="每一项里当作类目的字段"
          :value="config.mapping.categoryField"
          @change="(e) => patchMapping('categoryField', (e.target as HTMLInputElement).value)"
        />
      </label>
      <label class="rte-cp-field">
        <span class="rte-cp-field-label">数值字段</span>
        <input
          class="rte-cp-input"
          type="text"
          placeholder="value"
          title="每一项里当作数值的字段"
          :value="config.mapping.valueField"
          @change="(e) => patchMapping('valueField', (e.target as HTMLInputElement).value)"
        />
      </label>
      <label class="rte-cp-field">
        <span class="rte-cp-field-label">系列字段（可选）</span>
        <input
          class="rte-cp-input"
          type="text"
          placeholder="series"
          title="可选。用这个字段把数据分成多个系列"
          :value="config.mapping.seriesField"
          @change="(e) => patchMapping('seriesField', (e.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <div class="rte-cp-sub">
      <div class="rte-cp-sub-title">鉴权</div>
      <label class="rte-cp-field">
        <span class="rte-cp-field-label">鉴权方式</span>
        <select class="rte-cp-input" :value="config.auth" title="无鉴权、自定义请求头，或用本系统登录态" @change="onAuth">
          <option v-for="opt in authOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <p v-if="config.auth === 'session' && !hasSessionToken" class="rte-cp-warn">
        当前浏览器没有登录态，接口请求会不带鉴权信息。
      </p>
      <template v-if="config.auth === 'custom'">
        <label class="rte-cp-field">
          <span class="rte-cp-field-label">Bearer Token</span>
          <input
            class="rte-cp-input"
            type="password"
            placeholder="仅保存在本机浏览器"
            title="Bearer Token，只存在这台浏览器里"
            :value="bearerToken"
            @change="(e) => (bearerToken = (e.target as HTMLInputElement).value)"
          />
        </label>
        <label class="rte-cp-field">
          <span class="rte-cp-field-label">自定义 Header 键</span>
          <input
            class="rte-cp-input"
            type="text"
            placeholder="X-Api-Key"
            title="自定义请求头的名字，例如 X-Api-Key"
            :value="headerKey"
            @change="(e) => (headerKey = (e.target as HTMLInputElement).value)"
          />
        </label>
        <label class="rte-cp-field">
          <span class="rte-cp-field-label">自定义 Header 值</span>
          <input
            class="rte-cp-input"
            type="password"
            title="自定义请求头的值，只存在这台浏览器里"
            :value="headerValue"
            @change="(e) => (headerValue = (e.target as HTMLInputElement).value)"
          />
        </label>
        <div class="rte-cp-row-actions">
          <button type="button" class="rte-cp-mini" title="把 Token 和请求头存到本机，不写进文档" @click="saveSecret">保存密钥到本地</button>
        </div>
        <p class="rte-cp-warn">
          自定义 Token 保存在本机浏览器，不会写进文档或导出的 HTML；共享文档的其他人拿不到该密钥，
          存在泄露风险，请谨慎使用。
        </p>
      </template>
    </div>

    <div class="rte-cp-row-actions">
      <button type="button" class="rte-cp-mini" title="看将要发出的地址和请求头，密钥用星号代替" @click="previewRequest">预览请求</button>
      <button type="button" class="rte-cp-mini" title="清掉地址、参数和字段映射" @click="resetConfig">清空配置</button>
    </div>
    <pre v-if="message" class="rte-cp-message">{{ message }}</pre>
  </div>
</template>
