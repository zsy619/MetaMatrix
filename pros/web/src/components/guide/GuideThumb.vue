<script setup lang="ts">
import type { TemplateId } from '../../stores/document'

withDefaults(
  defineProps<{
    templateId: TemplateId
    /** md = guide card preview; sm = aside recent-doc mini mark (~18–20px) */
    size?: 'md' | 'sm'
  }>(),
  { size: 'md' },
)
</script>

<template>
  <div class="thumb" :class="{ 'thumb--sm': size === 'sm' }" aria-hidden="true">
      <!-- 双三角 -->
      <svg
        v-if="templateId === 'dual-triangle'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="8" fill="#f7f7f7" />
        <rect x="8" y="8" width="40" height="48" fill="#fff" stroke="#C9A14A" stroke-width="1.3" />
        <rect x="8" y="8" width="40" height="11" fill="#C9A14A" />
        <rect x="152" y="8" width="40" height="48" fill="#fff" stroke="#3A9E96" stroke-width="1.3" />
        <rect x="152" y="8" width="40" height="11" fill="#3A9E96" />
        <polygon points="100,26 64,96 100,96" fill="#F2D27A" />
        <polygon points="100,26 100,96 136,96" fill="#7DCFC4" />
        <polygon points="100,26 64,96 136,96" fill="none" stroke="#d5d5d5" stroke-width="1" />
        <path d="M82 58 C92 50, 108 50, 118 58" fill="none" stroke="#E25B52" stroke-width="1.4" />
        <path d="M118 74 C108 82, 92 82, 82 74" fill="none" stroke="#E25B52" stroke-width="1.4" />
        <rect x="8" y="78" width="40" height="54" fill="#fff" stroke="#C9A14A" stroke-width="1.3" />
        <rect x="8" y="78" width="40" height="10" fill="#C9A14A" />
        <rect x="56" y="98" width="40" height="34" fill="#fff" stroke="#C9A14A" stroke-width="1.3" />
        <rect x="56" y="98" width="40" height="9" fill="#C9A14A" />
        <rect x="104" y="98" width="40" height="34" fill="#fff" stroke="#3A9E96" stroke-width="1.3" />
        <rect x="104" y="98" width="40" height="9" fill="#3A9E96" />
        <rect x="152" y="78" width="40" height="54" fill="#fff" stroke="#3A9E96" stroke-width="1.3" />
        <rect x="152" y="78" width="40" height="10" fill="#3A9E96" />
      </svg>

      <!-- 一堂 AI 双三角：左栏分组 + 3×2 六色 -->
      <svg
        v-else-if="templateId === 'dual-triangle-human-ai'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="8" y="8" width="16" height="52" fill="#F6EBD4" />
        <rect x="8" y="62" width="16" height="48" fill="#E5EEF3" />
        <text x="16" y="20" text-anchor="middle" font-size="6" font-weight="700" fill="#3c3424">人</text>
        <text x="16" y="30" text-anchor="middle" font-size="6" font-weight="700" fill="#3c3424">类</text>
        <text x="16" y="40" text-anchor="middle" font-size="6" font-weight="700" fill="#3c3424">三</text>
        <text x="16" y="50" text-anchor="middle" font-size="6" font-weight="700" fill="#3c3424">角</text>
        <text x="16" y="76" text-anchor="middle" font-size="6" font-weight="700" fill="#24343c">A</text>
        <text x="16" y="86" text-anchor="middle" font-size="6" font-weight="700" fill="#24343c">I</text>
        <text x="16" y="96" text-anchor="middle" font-size="6" font-weight="700" fill="#24343c">三</text>
        <text x="16" y="106" text-anchor="middle" font-size="6" font-weight="700" fill="#24343c">角</text>
        <rect x="26" y="8" width="54" height="14" fill="#A67C00" />
        <rect x="82" y="8" width="54" height="14" fill="#B85A38" />
        <rect x="138" y="8" width="54" height="14" fill="#A84562" />
        <rect x="26" y="22" width="54" height="38" fill="#FBF6E4" />
        <rect x="82" y="22" width="54" height="38" fill="#FBF1EB" />
        <rect x="138" y="22" width="54" height="38" fill="#FBEFF2" />
        <rect x="26" y="62" width="54" height="14" fill="#0E8A84" />
        <rect x="82" y="62" width="54" height="14" fill="#2A649F" />
        <rect x="138" y="62" width="54" height="14" fill="#187A4E" />
        <rect x="26" y="76" width="54" height="34" fill="#E5F6F5" />
        <rect x="82" y="76" width="54" height="34" fill="#E8F1FA" />
        <rect x="138" y="76" width="54" height="34" fill="#E7F6EF" />
        <text x="53" y="18" text-anchor="middle" font-size="6" font-weight="700" fill="#fff">H. 审美</text>
        <text x="109" y="18" text-anchor="middle" font-size="6" font-weight="700" fill="#fff">H. 体系</text>
        <text x="165" y="18" text-anchor="middle" font-size="5.5" font-weight="700" fill="#fff">H. 创造力</text>
        <text x="53" y="72" text-anchor="middle" font-size="6" font-weight="700" fill="#fff">A. 场景</text>
        <text x="109" y="72" text-anchor="middle" font-size="6" font-weight="700" fill="#fff">A. 数据</text>
        <text x="165" y="72" text-anchor="middle" font-size="5.5" font-weight="700" fill="#fff">A. 基本功</text>
        <text x="30" y="36" font-size="6.5" font-weight="650" fill="#7A5C00">终点</text>
        <text x="86" y="36" font-size="6.5" font-weight="650" fill="#8A4024">过程</text>
        <text x="142" y="36" font-size="6.5" font-weight="650" fill="#84344C">创新</text>
        <text x="30" y="90" font-size="6.5" font-weight="650" fill="#0B6B66">起点</text>
        <text x="86" y="90" font-size="6.5" font-weight="650" fill="#1C4C7C">资产</text>
        <text x="142" y="90" font-size="6.5" font-weight="650" fill="#125C3B">能力</text>
        <text x="10" y="122" font-size="5" fill="#5f6368">一堂 AI 双三角 · 梳理与预判</text>
        <text x="10" y="131" font-size="4.5" fill="#80868b">做加法 · 排优先级 · 先验证最高项</text>
      </svg>

      <!-- STAR 四象限 -->
      <svg
        v-else-if="templateId === 'star-quadrant'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="16" y="14" width="80" height="52" rx="6" fill="#FBEFF2" />
        <rect x="104" y="14" width="80" height="52" rx="6" fill="#E8F1FA" />
        <rect x="16" y="74" width="80" height="52" rx="6" fill="#E7F6EF" />
        <rect x="104" y="74" width="80" height="52" rx="6" fill="#F3EEF8" />
        <text x="28" y="46" font-size="22" font-weight="700" fill="#A84562">S</text>
        <text x="116" y="46" font-size="22" font-weight="700" fill="#2A649F">T</text>
        <text x="28" y="106" font-size="22" font-weight="700" fill="#187A4E">A</text>
        <text x="116" y="106" font-size="22" font-weight="700" fill="#6B4C9A">R</text>
        <line x1="100" y1="14" x2="100" y2="126" stroke="#dadce0" stroke-width="1.5" />
        <line x1="16" y1="70" x2="184" y2="70" stroke="#dadce0" stroke-width="1.5" />
      </svg>

      <!-- Y 模型：Y 形示意图 -->
      <svg
        v-else-if="templateId === 'y-model'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <!-- Y arms -->
        <line x1="100" y1="72" x2="48" y2="28" stroke="#ececec" stroke-width="2.2" />
        <line x1="100" y1="72" x2="152" y2="28" stroke="#ececec" stroke-width="2.2" />
        <line x1="100" y1="72" x2="100" y2="108" stroke="#ececec" stroke-width="2.2" />
        <!-- boxes -->
        <rect x="18" y="14" width="40" height="22" rx="3" fill="none" stroke="#e4e6e8" stroke-dasharray="0" />
        <rect x="142" y="14" width="40" height="22" rx="3" fill="none" stroke="#e4e6e8" stroke-dasharray="0" />
        <rect x="70" y="58" width="60" height="28" rx="4" fill="#fff" stroke="#e53935" stroke-width="1.6" />
        <text x="100" y="76" text-anchor="middle" font-size="11" font-weight="700" fill="#202124">认知</text>
        <rect x="72" y="108" width="56" height="18" rx="3" fill="none" stroke="#e4e6e8" stroke-dasharray="0" />
        <rect x="24" y="128" width="152" height="8" rx="2" fill="#eceff1" />
        <text x="36" y="28" font-size="8" fill="#5f6368">理论</text>
        <text x="154" y="28" font-size="8" fill="#5f6368">事实</text>
      </svg>

      <!-- 刻意练习：三角循环示意图 -->
      <svg
        v-else-if="templateId === 'deliberate-practice'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f3f4f6" />
        <text x="100" y="22" text-anchor="middle" font-size="11" font-weight="800" fill="#A67C00">前提：长期追求</text>
        <polygon
          points="100,38 168,118 32,118"
          fill="none"
          stroke="#c5c9ce"
          stroke-width="6"
          stroke-linejoin="round"
          opacity="0.7"
        />
        <circle cx="100" cy="44" r="10" fill="#2A649F" />
        <circle cx="160" cy="112" r="10" fill="#0E8A84" />
        <circle cx="40" cy="112" r="10" fill="#A67C00" />
        <circle
          cx="100"
          cy="88"
          r="16"
          fill="none"
          stroke="#0E8A84"
          stroke-width="1.5"
          stroke-dasharray="0"
        />
        <text x="100" y="91" text-anchor="middle" font-size="8" font-weight="700" fill="#0E8A84">重复</text>
        <text x="100" y="36" text-anchor="middle" font-size="7" font-weight="700" fill="#2A649F">A</text>
        <text x="160" y="128" text-anchor="middle" font-size="7" font-weight="700" fill="#0E8A84">B</text>
        <text x="40" y="128" text-anchor="middle" font-size="7" font-weight="700" fill="#A67C00">C</text>
      </svg>

      <!-- 需求评估三角形：雷达缩略图 -->
      <svg
        v-else-if="templateId === 'demand-triangle'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f4f5f7" />
        <polygon points="100,22 168,118 32,118" fill="none" stroke="#e4e6e8" stroke-width="1.6" />
        <polygon points="100,40 148,108 52,108" fill="none" stroke="#c5c9ce" stroke-width="1.1" />
        <polygon points="100,58 128,98 72,98" fill="none" stroke="#c5c9ce" stroke-width="1.1" />
        <polygon points="100,34 158,112 42,112" fill="rgba(212,175,55,0.35)" stroke="#A67C00" stroke-width="1.2" />
        <polygon points="100,52 138,104 62,104" fill="rgba(129,199,132,0.4)" stroke="#66bb6a" stroke-width="1.2" />
        <polygon points="100,70 120,96 80,96" fill="rgba(77,182,172,0.45)" stroke="#26a69a" stroke-width="1.2" />
        <circle cx="18" cy="28" r="4" fill="#A67C00" />
        <circle cx="18" cy="44" r="4" fill="#66bb6a" />
        <circle cx="18" cy="60" r="4" fill="#26a69a" />
        <text x="100" y="16" text-anchor="middle" font-size="8" font-weight="700" fill="#5f6368">普遍性</text>
        <text x="28" y="132" text-anchor="middle" font-size="7" font-weight="700" fill="#5f6368">频次</text>
        <text x="172" y="132" text-anchor="middle" font-size="7" font-weight="700" fill="#5f6368">刚性</text>
      </svg>

      <!-- 五步法（基础版）：五列分色 + 主题词 + 方法标签 -->
      <svg
        v-else-if="templateId === 'five-step-basic'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <g font-weight="700" text-anchor="middle">
          <rect x="8" y="8" width="36" height="14" fill="#A67C00" />
          <text x="26" y="18" font-size="6.5" fill="#fff">需求</text>
          <rect x="8" y="22" width="36" height="58" fill="#FBF6E4" />
          <text x="12" y="36" font-size="6.5" text-anchor="start" fill="#7A5C00">用户</text>
          <rect x="8" y="80" width="36" height="16" fill="#FBF6E4" />
          <text x="26" y="91" font-size="4.4" fill="#7A5C00">逐级拆解</text>

          <rect x="44" y="8" width="36" height="14" fill="#0E8A84" />
          <text x="62" y="18" font-size="5.2" fill="#fff">解决方案</text>
          <rect x="44" y="22" width="36" height="58" fill="#E5F6F5" />
          <text x="48" y="36" font-size="6.5" text-anchor="start" fill="#0B6B66">内核</text>
          <rect x="44" y="80" width="36" height="16" fill="#E5F6F5" />
          <text x="62" y="91" font-size="4.4" fill="#0B6B66">全局预判</text>

          <rect x="80" y="8" width="36" height="14" fill="#2A649F" />
          <text x="98" y="18" font-size="5.2" fill="#fff">商业模式</text>
          <rect x="80" y="22" width="36" height="58" fill="#E8F1FA" />
          <text x="84" y="36" font-size="6.5" text-anchor="start" fill="#1C4C7C">单元</text>
          <rect x="80" y="80" width="36" height="16" fill="#E8F1FA" />
          <text x="98" y="91" font-size="4.4" fill="#1C4C7C">专业选项</text>

          <rect x="116" y="8" width="36" height="14" fill="#187A4E" />
          <text x="134" y="18" font-size="6.5" fill="#fff">增长</text>
          <rect x="116" y="22" width="36" height="58" fill="#E7F6EF" />
          <text x="120" y="36" font-size="6.5" text-anchor="start" fill="#125C3B">指标</text>
          <rect x="116" y="80" width="36" height="16" fill="#E7F6EF" />
          <text x="134" y="91" font-size="4.4" fill="#125C3B">努力定量</text>

          <rect x="152" y="8" width="40" height="14" fill="#A84562" />
          <text x="172" y="18" font-size="6.5" fill="#fff">壁垒</text>
          <rect x="152" y="22" width="40" height="58" fill="#FBEFF2" />
          <text x="156" y="36" font-size="6.5" text-anchor="start" fill="#84344C">护城河</text>
          <rect x="152" y="80" width="40" height="16" fill="#FBEFF2" />
          <text x="172" y="91" font-size="4.4" fill="#84344C">动态更新</text>
        </g>
        <text x="10" y="112" font-size="5" fill="#5f6368">基础版 · 先写主题词，再填正文</text>
        <text x="10" y="124" font-size="4.6" fill="#80868b">放大编辑 · 底部可挂相关资料</text>
      </svg>

      <!-- 五步法（分工版）：左分类栏 + 五列分色 -->
      <svg
        v-else-if="templateId === 'five-step-division'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="8" y="8" width="18" height="14" fill="#f7f7f7" />
        <g font-size="5.6" font-weight="700" text-anchor="middle" fill="#fff">
          <rect x="26" y="8" width="32" height="14" fill="#A67C00" />
          <text x="42" y="17.5">需求</text>
          <rect x="58" y="8" width="32" height="14" fill="#0E8A84" />
          <text x="74" y="17.5">方案</text>
          <rect x="90" y="8" width="32" height="14" fill="#2A649F" />
          <text x="106" y="17.5">模式</text>
          <rect x="122" y="8" width="32" height="14" fill="#187A4E" />
          <text x="138" y="17.5">增长</text>
          <rect x="154" y="8" width="38" height="14" fill="#A84562" />
          <text x="173" y="17.5">壁垒</text>
        </g>
        <g font-size="4.2" font-weight="700">
          <rect x="8" y="22" width="18" height="22" fill="#F6EBD4" />
          <text x="17" y="35" text-anchor="middle" fill="#3C3424">定性</text>
          <rect x="8" y="44" width="18" height="22" fill="#E5EEF3" />
          <text x="17" y="57" text-anchor="middle" fill="#24343C">定量</text>
          <rect x="8" y="66" width="18" height="22" fill="#E7F6EF" />
          <text x="17" y="79" text-anchor="middle" fill="#143C28">分工</text>
        </g>
        <g>
          <rect x="26" y="22" width="32" height="22" fill="#FBF6E4" />
          <rect x="58" y="22" width="32" height="22" fill="#E5F6F5" />
          <rect x="90" y="22" width="32" height="22" fill="#E8F1FA" />
          <rect x="122" y="22" width="32" height="22" fill="#E7F6EF" />
          <rect x="154" y="22" width="38" height="22" fill="#FBEFF2" />
          <rect x="26" y="44" width="32" height="22" fill="#FBF6E4" />
          <rect x="58" y="44" width="32" height="22" fill="#E5F6F5" />
          <rect x="90" y="44" width="32" height="22" fill="#E8F1FA" />
          <rect x="122" y="44" width="32" height="22" fill="#E7F6EF" />
          <rect x="154" y="44" width="38" height="22" fill="#FBEFF2" />
          <rect x="26" y="66" width="32" height="22" fill="#FBF6E4" />
          <rect x="58" y="66" width="32" height="22" fill="#E5F6F5" />
          <rect x="90" y="66" width="32" height="22" fill="#E8F1FA" />
          <rect x="122" y="66" width="32" height="22" fill="#E7F6EF" />
          <rect x="154" y="66" width="38" height="22" fill="#FBEFF2" />
        </g>
        <g font-size="5" font-weight="650">
          <text x="29" y="32" fill="#7A5C00">取舍</text>
          <text x="61" y="32" fill="#0B6B66">取舍</text>
          <text x="93" y="32" fill="#1C4C7C">取舍</text>
          <text x="125" y="32" fill="#125C3B">取舍</text>
          <text x="157" y="32" fill="#84344C">取舍</text>
          <text x="29" y="54" fill="#7A5C00">测量</text>
          <text x="61" y="54" fill="#0B6B66">测量</text>
          <text x="93" y="54" fill="#1C4C7C">测量</text>
          <text x="125" y="54" fill="#125C3B">测量</text>
          <text x="157" y="54" fill="#84344C">测量</text>
          <text x="29" y="76" fill="#7A5C00">分工</text>
          <text x="61" y="76" fill="#0B6B66">分工</text>
          <text x="93" y="76" fill="#1C4C7C">分工</text>
          <text x="125" y="76" fill="#125C3B">分工</text>
          <text x="157" y="76" fill="#84344C">分工</text>
        </g>
        <g font-size="4" font-weight="700" text-anchor="middle">
          <text x="42" y="100" fill="#7A5C00">逐级拆解</text>
          <text x="74" y="100" fill="#0B6B66">全局预判</text>
          <text x="106" y="100" fill="#1C4C7C">专业选项</text>
          <text x="138" y="100" fill="#125C3B">努力定量</text>
          <text x="173" y="100" fill="#84344C">动态更新</text>
        </g>
        <text x="10" y="118" font-size="5" fill="#5f6368">分工版 · 定性取舍 / 定量测量 / 团队分工</text>
        <text x="10" y="130" font-size="4.6" fill="#80868b">先取舍，再测量，再落到人</text>
      </svg>

      <!-- 五步法（提高版）：分色列 + 红色「非*」 -->
      <svg
        v-else-if="templateId === 'five-step-advanced'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <g font-size="6" font-weight="700" text-anchor="middle" fill="#fff">
          <rect x="8" y="8" width="36" height="14" fill="#A67C00" />
          <text x="26" y="18">需求</text>
          <rect x="44" y="8" width="36" height="14" fill="#0E8A84" />
          <text x="62" y="18">方案</text>
          <rect x="80" y="8" width="36" height="14" fill="#2A649F" />
          <text x="98" y="18">模式</text>
          <rect x="116" y="8" width="36" height="14" fill="#187A4E" />
          <text x="134" y="18">增长</text>
          <rect x="152" y="8" width="40" height="14" fill="#A84562" />
          <text x="172" y="18">壁垒</text>
        </g>
        <rect x="8" y="22" width="36" height="28" fill="#FBF6E4" />
        <rect x="8" y="50" width="36" height="28" fill="#FDECEA" />
        <text x="10" y="34" font-size="4.6" font-weight="700" fill="#7A5C00">需求：用户</text>
        <text x="10" y="62" font-size="4.6" font-weight="700" fill="#9B1C1C">非用户</text>
        <rect x="44" y="22" width="36" height="28" fill="#E5F6F5" />
        <rect x="44" y="50" width="36" height="28" fill="#FDECEA" />
        <text x="46" y="34" font-size="4.6" font-weight="700" fill="#0B6B66">内核</text>
        <text x="46" y="62" font-size="4.6" font-weight="700" fill="#9B1C1C">非内核</text>
        <rect x="80" y="22" width="36" height="56" fill="#E8F1FA" />
        <text x="82" y="34" font-size="4.4" font-weight="700" fill="#1C4C7C">单元模型</text>
        <rect x="116" y="22" width="36" height="56" fill="#E7F6EF" />
        <text x="118" y="34" font-size="4.6" font-weight="700" fill="#125C3B">指标</text>
        <rect x="152" y="22" width="40" height="28" fill="#FBEFF2" />
        <rect x="152" y="50" width="40" height="28" fill="#FDECEA" />
        <text x="154" y="34" font-size="4.6" font-weight="700" fill="#84344C">壁垒</text>
        <text x="154" y="62" font-size="4.6" font-weight="700" fill="#9B1C1C">非壁垒</text>
        <g font-size="4.2" font-weight="700" text-anchor="middle">
          <text x="26" y="90" fill="#7A5C00">逐级拆解</text>
          <text x="62" y="90" fill="#0B6B66">全局预判</text>
          <text x="98" y="90" fill="#1C4C7C">专业选项</text>
          <text x="134" y="90" fill="#125C3B">努力定量</text>
          <text x="172" y="90" fill="#84344C">动态更新</text>
        </g>
        <text x="10" y="112" font-size="5" fill="#5f6368">提高版 · 先写是什么，再用红色「非*」划界</text>
        <text x="10" y="124" font-size="4.6" fill="#80868b">红区是排除项，不是补充卖点</text>
      </svg>

      <!-- 五步法（进阶版）：每提示独立格 + 红色「非*」 -->
      <svg
        v-else-if="templateId === 'five-step-pro'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <g font-size="6" font-weight="700" text-anchor="middle" fill="#fff">
          <rect x="8" y="8" width="36" height="12" fill="#A67C00" />
          <text x="26" y="16.5">需求</text>
          <rect x="44" y="8" width="36" height="12" fill="#0E8A84" />
          <text x="62" y="16.5">方案</text>
          <rect x="80" y="8" width="36" height="12" fill="#2A649F" />
          <text x="98" y="16.5">模式</text>
          <rect x="116" y="8" width="36" height="12" fill="#187A4E" />
          <text x="134" y="16.5">增长</text>
          <rect x="152" y="8" width="40" height="12" fill="#A84562" />
          <text x="172" y="16.5">壁垒</text>
        </g>
        <rect x="8" y="20" width="36" height="18" fill="#FBF6E4" />
        <rect x="8" y="38" width="36" height="18" fill="#FBF6E4" />
        <rect x="8" y="56" width="36" height="18" fill="#FDECEA" />
        <text x="10" y="31" font-size="4" font-weight="700" fill="#7A5C00">细分用户</text>
        <text x="10" y="49" font-size="4" font-weight="700" fill="#7A5C00">场景问题</text>
        <text x="10" y="67" font-size="4" font-weight="700" fill="#9B1C1C">非用户</text>
        <rect x="44" y="20" width="36" height="18" fill="#E5F6F5" />
        <rect x="44" y="38" width="36" height="18" fill="#E5F6F5" />
        <rect x="44" y="56" width="36" height="18" fill="#FDECEA" />
        <text x="46" y="31" font-size="4" font-weight="700" fill="#0B6B66">核心卖点</text>
        <text x="46" y="49" font-size="4" font-weight="700" fill="#0B6B66">解决方案</text>
        <text x="46" y="67" font-size="4" font-weight="700" fill="#9B1C1C">非内核</text>
        <rect x="80" y="20" width="36" height="27" fill="#E8F1FA" />
        <rect x="80" y="47" width="36" height="27" fill="#E8F1FA" />
        <text x="82" y="32" font-size="4" font-weight="700" fill="#1C4C7C">收入</text>
        <text x="82" y="59" font-size="4" font-weight="700" fill="#1C4C7C">成本</text>
        <rect x="116" y="20" width="36" height="27" fill="#E7F6EF" />
        <rect x="116" y="47" width="36" height="27" fill="#E7F6EF" />
        <text x="118" y="32" font-size="4" font-weight="700" fill="#125C3B">核心指标</text>
        <text x="118" y="59" font-size="4" font-weight="700" fill="#125C3B">获客渠道</text>
        <rect x="152" y="20" width="40" height="27" fill="#FBEFF2" />
        <rect x="152" y="47" width="40" height="27" fill="#FDECEA" />
        <text x="154" y="32" font-size="4" font-weight="700" fill="#84344C">护城河</text>
        <text x="154" y="59" font-size="4" font-weight="700" fill="#9B1C1C">非壁垒</text>
        <g font-size="4.2" font-weight="700" text-anchor="middle">
          <text x="26" y="86" fill="#7A5C00">逐级拆解</text>
          <text x="62" y="86" fill="#0B6B66">全局预判</text>
          <text x="98" y="86" fill="#1C4C7C">专业选项</text>
          <text x="134" y="86" fill="#125C3B">努力定量</text>
          <text x="172" y="86" fill="#84344C">动态更新</text>
        </g>
        <text x="10" y="108" font-size="5" fill="#5f6368">进阶版 · 每个提示独立成格</text>
        <text x="10" y="120" font-size="4.6" fill="#80868b">固定标签在抬头，正文只写判断</text>
      </svg>

      <!-- 五步法（挑战版）：假设 + 五步，紫方法 / 橙非* -->
      <svg
        v-else-if="templateId === 'five-step-challenge'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <g font-size="5.2" font-weight="700" text-anchor="middle" fill="#fff">
          <rect x="6" y="8" width="30" height="12" fill="#6B4C9A" />
          <text x="21" y="16.5">假设</text>
          <rect x="36" y="8" width="30" height="12" fill="#A67C00" />
          <text x="51" y="16.5">需求</text>
          <rect x="66" y="8" width="30" height="12" fill="#0E8A84" />
          <text x="81" y="16.5">方案</text>
          <rect x="96" y="8" width="30" height="12" fill="#2A649F" />
          <text x="111" y="16.5">模式</text>
          <rect x="126" y="8" width="30" height="12" fill="#187A4E" />
          <text x="141" y="16.5">增长</text>
          <rect x="156" y="8" width="38" height="12" fill="#A84562" />
          <text x="175" y="16.5">壁垒</text>
        </g>
        <rect x="6" y="20" width="30" height="52" fill="#F3EEF8" />
        <text x="8" y="32" font-size="3.6" font-weight="700" fill="#4E3574">业务</text>
        <text x="8" y="42" font-size="3.4" font-weight="700" fill="#7B1FA2">《预判》</text>
        <rect x="36" y="20" width="30" height="40" fill="#FBF6E4" />
        <rect x="36" y="60" width="30" height="12" fill="#FFF4EC" />
        <text x="38" y="32" font-size="3.6" font-weight="700" fill="#7A5C00">细分</text>
        <text x="38" y="69" font-size="3.6" font-weight="700" fill="#8A3E12">非用户</text>
        <rect x="66" y="20" width="30" height="40" fill="#E5F6F5" />
        <rect x="66" y="60" width="30" height="12" fill="#FFF4EC" />
        <text x="68" y="32" font-size="3.6" font-weight="700" fill="#0B6B66">内核</text>
        <text x="68" y="69" font-size="3.6" font-weight="700" fill="#8A3E12">非内核</text>
        <rect x="96" y="20" width="30" height="52" fill="#E8F1FA" />
        <text x="98" y="32" font-size="3.6" font-weight="700" fill="#1C4C7C">收支</text>
        <text x="98" y="44" font-size="3.4" fill="#1565C0">ROI</text>
        <rect x="126" y="20" width="30" height="52" fill="#E7F6EF" />
        <text x="128" y="32" font-size="3.6" font-weight="700" fill="#125C3B">指标</text>
        <text x="128" y="44" font-size="3.4" font-weight="700" fill="#125C3B">五力</text>
        <rect x="156" y="20" width="38" height="40" fill="#FBEFF2" />
        <rect x="156" y="60" width="38" height="12" fill="#FFF4EC" />
        <text x="158" y="32" font-size="3.6" font-weight="700" fill="#84344C">强度</text>
        <text x="158" y="69" font-size="3.6" font-weight="700" fill="#8A3E12">非壁垒</text>
        <g font-size="3.6" font-weight="700" text-anchor="middle">
          <text x="21" y="84" fill="#4E3574">机会预判</text>
          <text x="51" y="84" fill="#7A5C00">逐级拆解</text>
          <text x="81" y="84" fill="#0B6B66">全局预判</text>
          <text x="111" y="84" fill="#1C4C7C">专业选项</text>
          <text x="141" y="84" fill="#125C3B">努力定量</text>
          <text x="175" y="84" fill="#84344C">动态更新</text>
        </g>
        <text x="8" y="104" font-size="5" fill="#5f6368">挑战版 · 先假设，再沿五步验证</text>
        <text x="8" y="116" font-size="4.6" fill="#80868b">紫字方法名 · 橙色「非*」是排除项</text>
      </svg>

      <!-- 五步法（原版）：分色五列 + 定性 / 定量 -->
      <svg
        v-else-if="templateId === 'five-step'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <g font-size="6" font-weight="700" text-anchor="middle" fill="#fff">
          <rect x="8" y="8" width="36" height="14" fill="#A67C00" />
          <text x="26" y="18">需求</text>
          <rect x="44" y="8" width="36" height="14" fill="#0E8A84" />
          <text x="62" y="18">方案</text>
          <rect x="80" y="8" width="36" height="14" fill="#2A649F" />
          <text x="98" y="18">模式</text>
          <rect x="116" y="8" width="36" height="14" fill="#187A4E" />
          <text x="134" y="18">增长</text>
          <rect x="152" y="8" width="40" height="14" fill="#A84562" />
          <text x="172" y="18">壁垒</text>
        </g>
        <rect x="8" y="22" width="36" height="34" fill="#FBF6E4" />
        <rect x="8" y="56" width="36" height="22" fill="#FBF6E4" />
        <text x="10" y="34" font-size="4.4" font-weight="700" fill="#7A5C00">定性 · 谁</text>
        <text x="10" y="68" font-size="4.4" font-weight="700" fill="#7A5C00">定量 · 规模</text>
        <rect x="44" y="22" width="36" height="34" fill="#E5F6F5" />
        <rect x="44" y="56" width="36" height="22" fill="#E5F6F5" />
        <text x="46" y="34" font-size="4.4" font-weight="700" fill="#0B6B66">定性 · 内核</text>
        <text x="46" y="68" font-size="4.4" font-weight="700" fill="#0B6B66">定量 · 证据</text>
        <rect x="80" y="22" width="36" height="34" fill="#E8F1FA" />
        <rect x="80" y="56" width="36" height="22" fill="#E8F1FA" />
        <text x="82" y="34" font-size="4.2" font-weight="700" fill="#1C4C7C">定性 · 单元</text>
        <text x="82" y="68" font-size="4.4" font-weight="700" fill="#1C4C7C">定量 · 账</text>
        <rect x="116" y="22" width="36" height="34" fill="#E7F6EF" />
        <rect x="116" y="56" width="36" height="22" fill="#E7F6EF" />
        <text x="118" y="34" font-size="4.2" font-weight="700" fill="#125C3B">定性 · 指标</text>
        <text x="118" y="68" font-size="4.4" font-weight="700" fill="#125C3B">定量 · 速率</text>
        <rect x="152" y="22" width="40" height="34" fill="#FBEFF2" />
        <rect x="152" y="56" width="40" height="22" fill="#FBEFF2" />
        <text x="154" y="34" font-size="4.2" font-weight="700" fill="#84344C">定性 · 难复制</text>
        <text x="154" y="68" font-size="4.4" font-weight="700" fill="#84344C">定量 · 强度</text>
        <g font-size="4.2" font-weight="700" text-anchor="middle">
          <text x="26" y="90" fill="#7A5C00">逐级拆解</text>
          <text x="62" y="90" fill="#0B6B66">全局预判</text>
          <text x="98" y="90" fill="#1C4C7C">专业选项</text>
          <text x="134" y="90" fill="#125C3B">努力定量</text>
          <text x="172" y="90" fill="#84344C">动态更新</text>
        </g>
        <text x="10" y="112" font-size="5" fill="#5f6368">原版 · 定性判断与定量证据放在一起</text>
        <text x="10" y="124" font-size="4.6" fill="#80868b">每格主题词抓住重点</text>
      </svg>

      <!-- AI场景取舍评估：2×4 网格示意 -->
      <svg
        v-else-if="templateId === 'ai-tradeoff'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
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
        v-else-if="templateId === 'product-content'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="10" y="10" width="88" height="14" fill="#0E8A84" />
        <rect x="102" y="10" width="88" height="14" fill="#A67C00" />
        <text x="54" y="20" text-anchor="middle" font-size="7" font-weight="800" fill="#fff">用户</text>
        <text x="146" y="20" text-anchor="middle" font-size="7" font-weight="800" fill="#fff">核心指标</text>
        <rect x="10" y="24" width="88" height="28" fill="#E5F6F5" />
        <rect x="102" y="24" width="88" height="28" fill="#FBF6E4" />
        <rect x="10" y="58" width="58" height="14" fill="#B85A38" />
        <rect x="71" y="58" width="58" height="14" fill="#2A649F" />
        <rect x="132" y="58" width="58" height="14" fill="#187A4E" />
        <text x="39" y="68" text-anchor="middle" font-size="5.5" font-weight="800" fill="#fff">加法</text>
        <text x="100" y="68" text-anchor="middle" font-size="5.5" font-weight="800" fill="#fff">减法</text>
        <text x="161" y="68" text-anchor="middle" font-size="5.5" font-weight="800" fill="#fff">验证</text>
        <rect x="10" y="72" width="58" height="56" fill="#FBF1EB" />
        <rect x="71" y="72" width="58" height="56" fill="#E8F1FA" />
        <rect x="132" y="72" width="58" height="56" fill="#E7F6EF" />
      </svg>

      <!-- OSCAR调研：3+2 网格示意 -->
      <svg
        v-else-if="templateId === 'oscar'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#FBF6E4" />
        <rect x="10" y="12" width="58" height="52" fill="#FBF6E4" stroke="#ececec" stroke-width="1.2" />
        <rect x="71" y="12" width="58" height="52" fill="#FBF6E4" stroke="#ececec" stroke-width="1.2" />
        <rect x="132" y="12" width="58" height="52" fill="#FBF6E4" stroke="#ececec" stroke-width="1.2" />
        <text x="18" y="28" font-size="8" font-weight="800" fill="#202124">O 目标</text>
        <text x="79" y="28" font-size="8" font-weight="800" fill="#202124">S 范围</text>
        <text x="140" y="28" font-size="8" font-weight="800" fill="#202124">C 清单</text>
        <text x="14" y="58" font-size="22" font-weight="800" fill="rgba(100,149,237,0.28)">O</text>
        <text x="75" y="58" font-size="22" font-weight="800" fill="rgba(100,149,237,0.28)">S</text>
        <text x="136" y="58" font-size="22" font-weight="800" fill="rgba(100,149,237,0.28)">C</text>
        <rect x="10" y="70" width="88" height="58" fill="#FBF6E4" stroke="#ececec" stroke-width="1.2" />
        <rect x="102" y="70" width="88" height="58" fill="#FBF6E4" stroke="#ececec" stroke-width="1.2" />
        <text x="18" y="88" font-size="8" font-weight="800" fill="#202124">A 获取</text>
        <text x="110" y="88" font-size="8" font-weight="800" fill="#202124">R 用好</text>
        <text x="14" y="122" font-size="22" font-weight="800" fill="rgba(100,149,237,0.28)">A</text>
        <text x="106" y="122" font-size="22" font-weight="800" fill="rgba(100,149,237,0.28)">R</text>
      </svg>

      <!-- 行业分析：3顶 + 3全宽行 -->
      <svg
        v-else-if="templateId === 'industry-analysis'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="10" y="10" width="58" height="36" fill="#fff" stroke="#ececec" stroke-width="1.1" />
        <rect x="71" y="10" width="58" height="36" fill="#fff" stroke="#ececec" stroke-width="1.1" />
        <rect x="132" y="10" width="58" height="36" fill="#fff" stroke="#ececec" stroke-width="1.1" />
        <text x="14" y="24" font-size="6.5" font-weight="800" fill="#202124">拆解产业链</text>
        <text x="75" y="24" font-size="6.5" font-weight="800" fill="#202124">洞察变化</text>
        <text x="136" y="24" font-size="6.5" font-weight="800" fill="#202124">稳态B点</text>
        <rect x="10" y="52" width="180" height="24" fill="#fff" stroke="#ececec" stroke-width="1.1" />
        <text x="16" y="67" font-size="7" font-weight="800" fill="#202124">判断行业周期</text>
        <rect x="10" y="82" width="180" height="24" fill="#fff" stroke="#ececec" stroke-width="1.1" />
        <text x="16" y="97" font-size="7" font-weight="800" fill="#202124">行业天花板大小</text>
        <rect x="10" y="112" width="180" height="20" fill="#fff" stroke="#ececec" stroke-width="1.1" />
        <text x="16" y="125" font-size="7" font-weight="800" fill="#202124">行业集中度</text>
      </svg>

      <!-- 关键阻力：黄头 + 三列表格 -->
      <svg
        v-else-if="templateId === 'key-resistance'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="10" y="8" width="180" height="18" fill="#FBF6E4" stroke="#e0e0e0" stroke-width="0.6" />
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
        v-else-if="templateId === 'conversion-tradeoff'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="10" y="8" width="180" height="18" fill="#FBF6E4" stroke="#e0e0e0" stroke-width="0.6" />
        <text x="100" y="20" text-anchor="middle" font-size="6.5" font-weight="800" fill="#202124">一堂最佳转化率分析画布·取舍版</text>
        <rect x="10" y="28" width="36" height="12" fill="#FBF6E4" stroke="#dadce0" stroke-width="0.5" />
        <rect x="48" y="28" width="46" height="12" fill="#FBF6E4" stroke="#dadce0" stroke-width="0.5" />
        <rect x="96" y="28" width="46" height="12" fill="#FBF6E4" stroke="#dadce0" stroke-width="0.5" />
        <rect x="144" y="28" width="46" height="12" fill="#FBF6E4" stroke="#dadce0" stroke-width="0.5" />
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
        v-else-if="templateId === 'industry-forecast'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="10" y="8" width="180" height="16" fill="#A67C00" stroke="#A67C00" stroke-width="0.7" />
        <text x="100" y="19" text-anchor="middle" font-size="7" font-weight="800" fill="#fff">行业预判分析框架</text>
        <rect x="10" y="28" width="58" height="28" fill="#fff" stroke="#ececec" stroke-width="1" />
        <rect x="71" y="28" width="58" height="28" fill="#fff" stroke="#ececec" stroke-width="1" />
        <rect x="132" y="28" width="58" height="28" fill="#fff" stroke="#ececec" stroke-width="1" />
        <text x="14" y="40" font-size="5.5" font-weight="800" fill="#202124">1.拆解产业链</text>
        <text x="75" y="40" font-size="5.5" font-weight="800" fill="#202124">2.洞察变化</text>
        <text x="136" y="40" font-size="5.5" font-weight="800" fill="#202124">3.稳态B点</text>
        <rect x="10" y="60" width="180" height="20" fill="#fff" stroke="#ececec" stroke-width="1" />
        <text x="16" y="73" font-size="6.5" font-weight="800" fill="#202124">4.判断行业周期</text>
        <rect x="10" y="84" width="180" height="20" fill="#fff" stroke="#ececec" stroke-width="1" />
        <text x="16" y="97" font-size="6.5" font-weight="800" fill="#202124">5.行业天花板大小</text>
        <rect x="10" y="108" width="180" height="20" fill="#fff" stroke="#ececec" stroke-width="1" />
        <text x="16" y="121" font-size="6.5" font-weight="800" fill="#202124">6.行业集中度</text>
      </svg>

      <!-- 科学开会：三栏浅黄 -->
      <svg
        v-else-if="templateId === 'scientific-meeting'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#FBF6E4" />
        <!-- 三列 + 底栏，黑线浅黄，贴近附图 -->
        <rect x="8" y="8" width="184" height="124" fill="#FBF6E4" stroke="#ececec" stroke-width="1.2" />
        <line x1="69.3" y1="8" x2="69.3" y2="112" stroke="#ececec" stroke-width="1" />
        <line x1="130.7" y1="8" x2="130.7" y2="112" stroke="#ececec" stroke-width="1" />
        <line x1="8" y1="112" x2="192" y2="112" stroke="#ececec" stroke-width="1" />
        <text x="14" y="24" font-size="7" font-weight="800" fill="#1a1a1a">Step1. 目标</text>
        <text x="75" y="24" font-size="7" font-weight="800" fill="#1a1a1a">Step2. 原则</text>
        <text x="136" y="24" font-size="7" font-weight="800" fill="#1a1a1a">Step3. 流程</text>
        <text x="14" y="36" font-size="4.2" fill="#8e8a7a" font-style="italic">希望达成的目标与价值</text>
        <text x="75" y="36" font-size="4.2" fill="#8e8a7a" font-style="italic">原则 / 氛围与姿势</text>
        <text x="136" y="36" font-size="4.2" fill="#8e8a7a" font-style="italic">第一第二第三步</text>
        <text x="14" y="98" font-size="4.5" fill="#1a1a1a">不开会有哪些问题</text>
        <text x="136" y="98" font-size="4.5" fill="#1a1a1a">效率手段</text>
        <text x="14" y="126" font-size="5.5" fill="#1a1a1a">会议类型：____</text>
        <text x="110" y="126" font-size="5.5" fill="#1a1a1a">梳理人：____</text>
      </svg>

      <!-- IPO：I→P→O + 反馈闭环 -->
      <svg
        v-else-if="templateId === 'ipo'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <!-- Goal -->
        <rect x="118" y="8" width="42" height="16" fill="none" stroke="#e4e6e8" stroke-width="0.9" stroke-dasharray="0" />
        <text x="164" y="19" font-size="7" font-weight="800" fill="#202124">目标</text>
        <line x1="148" y1="26" x2="148" y2="34" stroke="#ececec" stroke-width="1" marker-end="url(#ipo-t-b)" />
        <!-- I P O boxes -->
        <rect x="18" y="42" width="40" height="36" fill="#fff" stroke="#e4e6e8" stroke-width="1" stroke-dasharray="0" />
        <rect x="80" y="42" width="40" height="36" fill="#fff" stroke="#e4e6e8" stroke-width="1" stroke-dasharray="0" />
        <rect x="142" y="42" width="40" height="36" fill="#fff" stroke="#e4e6e8" stroke-width="1" stroke-dasharray="0" />
        <text x="22" y="38" font-size="7.5" font-weight="800" fill="#A84562">输入</text>
        <text x="84" y="38" font-size="7.5" font-weight="800" fill="#A84562">处理</text>
        <text x="146" y="38" font-size="7.5" font-weight="800" fill="#A84562">输出</text>
        <!-- red arrows I→P→O -->
        <defs>
          <marker id="ipo-t-r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 1.5 L9 5 L0 8.5 z" fill="#A84562" />
          </marker>
          <marker id="ipo-t-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0 1.5 L9 5 L0 8.5 z" fill="#202124" />
          </marker>
        </defs>
        <line x1="60" y1="60" x2="76" y2="60" stroke="#A84562" stroke-width="1.6" marker-end="url(#ipo-t-r)" />
        <line x1="122" y1="60" x2="138" y2="60" stroke="#A84562" stroke-width="1.6" marker-end="url(#ipo-t-r)" />
        <!-- Pattern -->
        <line x1="100" y1="80" x2="100" y2="90" stroke="#ececec" stroke-width="1" />
        <text x="88" y="100" font-size="6.5" font-weight="800" fill="#202124">模型</text>
        <rect x="80" y="104" width="40" height="14" fill="#fff" stroke="#e4e6e8" stroke-width="0.9" stroke-dasharray="0" />
        <!-- Feedback -->
        <text x="48" y="130" font-size="6.5" font-weight="800" fill="#202124">反馈</text>
        <rect x="68" y="121" width="70" height="12" fill="#fff" stroke="#e4e6e8" stroke-width="0.9" stroke-dasharray="0" />
        <!-- feedback loop -->
        <path d="M162 80 L162 134 L28 134 L28 80" fill="none" stroke="#A84562" stroke-width="2.2" stroke-linejoin="round" marker-end="url(#ipo-t-r)" />
      </svg>

      <!-- 故障复盘：纵向七段文档 -->
      <svg
        v-else-if="templateId === 'incident-review'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
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
        <rect x="12" y="93" width="176" height="8" fill="#FBF6E4" stroke="#ffe082" stroke-width="0.5" />
        <text x="12" y="112" font-size="5.5" font-weight="700" fill="#202124">5.影响 · 6.需求 · 7.反思</text>
        <rect x="12" y="115" width="176" height="14" fill="#FBEFF2" stroke="#f5c6c2" stroke-width="0.5" />
      </svg>





      <!-- 增长假设清单：灰表头五列表格 -->
      <svg
        v-else-if="templateId === 'growth-assumptions'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="18" y="28" width="164" height="90" fill="#ffffff" stroke="#ececec" stroke-width="2" />
        <rect x="18" y="28" width="164" height="18" fill="#2A649F" stroke="#ececec" stroke-width="2" />
        <line x1="55" y1="28" x2="55" y2="118" stroke="#ececec" stroke-width="1.2" />
        <line x1="85" y1="28" x2="85" y2="118" stroke="#ececec" stroke-width="1.2" />
        <line x1="115" y1="28" x2="115" y2="118" stroke="#ececec" stroke-width="1.2" />
        <line x1="148" y1="28" x2="148" y2="118" stroke="#ececec" stroke-width="1.2" />
        <line x1="18" y1="64" x2="182" y2="64" stroke="#ececec" stroke-width="1.2" />
        <line x1="18" y1="82" x2="182" y2="82" stroke="#ececec" stroke-width="1.2" />
        <line x1="18" y1="100" x2="182" y2="100" stroke="#ececec" stroke-width="1.2" />
        <text x="36" y="41" text-anchor="middle" font-size="6" font-weight="800" fill="#fff">假设</text>
        <text x="70" y="41" text-anchor="middle" font-size="6" font-weight="800" fill="#fff">提出者</text>
        <text x="100" y="41" text-anchor="middle" font-size="6" font-weight="800" fill="#fff">时间</text>
        <text x="131" y="41" text-anchor="middle" font-size="6" font-weight="800" fill="#fff">负责人</text>
        <text x="165" y="41" text-anchor="middle" font-size="6" font-weight="800" fill="#fff">结果</text>
      </svg>

      <!-- 时间管理矩阵：艾森豪威尔四象限 -->
      <svg
        v-else-if="templateId === 'time-matrix'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <text x="100" y="14" text-anchor="middle" font-size="8" font-weight="800" fill="#202124">重要</text>
        <text x="14" y="76" text-anchor="middle" font-size="7.5" font-weight="800" fill="#202124">不紧急</text>
        <text x="186" y="76" text-anchor="middle" font-size="7.5" font-weight="800" fill="#202124">紧急</text>
        <text x="100" y="134" text-anchor="middle" font-size="8" font-weight="800" fill="#202124">不重要</text>
        <rect x="28" y="22" width="68" height="44" fill="#FBEFF2" />
        <rect x="104" y="22" width="68" height="44" fill="#FBF6E4" />
        <rect x="28" y="74" width="68" height="44" fill="#FBF1EB" />
        <rect x="104" y="74" width="68" height="44" fill="#E7F6EF" />
        <text x="62" y="48" text-anchor="middle" font-size="7" font-weight="800" fill="#202124">A</text>
        <text x="138" y="48" text-anchor="middle" font-size="7" font-weight="800" fill="#202124">B</text>
        <text x="62" y="100" text-anchor="middle" font-size="7" font-weight="800" fill="#202124">C</text>
        <text x="138" y="100" text-anchor="middle" font-size="7" font-weight="800" fill="#202124">D</text>
        <defs>
          <marker id="tm-t-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0 1.5 L9 5 L0 8.5 z" fill="#202124" />
          </marker>
        </defs>
        <line x1="100" y1="118" x2="100" y2="20" stroke="#ececec" stroke-width="1.4" marker-end="url(#tm-t-arr)" />
        <line x1="28" y1="68" x2="172" y2="68" stroke="#ececec" stroke-width="1.4" marker-end="url(#tm-t-arr)" />
      </svg>


      <!-- 人生红点工作状态区间：自治×舒适区四象限 -->
      <svg
        v-else-if="templateId === 'work-state-zones'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <text x="100" y="12" text-anchor="middle" font-size="7" font-weight="800" fill="#202124">自治</text>
        <text x="100" y="21" text-anchor="middle" font-size="4.5" fill="#9aa0a6">短期/长期统一</text>
        <text x="14" y="72" text-anchor="middle" font-size="6.5" font-weight="800" fill="#202124">舒适区</text>
        <text x="186" y="72" text-anchor="middle" font-size="6.5" font-weight="800" fill="#202124">非舒适区</text>
        <text x="100" y="132" text-anchor="middle" font-size="7" font-weight="800" fill="#202124">不自治</text>
        <rect x="42" y="32" width="46" height="14" rx="3" fill="#187A4E" />
        <text x="65" y="42" text-anchor="middle" font-size="5.5" font-weight="700" fill="#fff">幸福做事区</text>
        <text x="65" y="54" text-anchor="middle" font-size="4.5" fill="#125C3B">持续享受成果</text>
        <rect x="112" y="32" width="46" height="14" rx="3" fill="#A67C00" />
        <text x="135" y="42" text-anchor="middle" font-size="5.5" font-weight="700" fill="#fff">无限进步区</text>
        <text x="135" y="54" text-anchor="middle" font-size="4.5" fill="#7A5C00">持续挑战进步</text>
        <rect x="42" y="86" width="46" height="14" rx="3" fill="#A84562" />
        <text x="65" y="96" text-anchor="middle" font-size="5.5" font-weight="700" fill="#fff">低头做事区</text>
        <text x="65" y="108" text-anchor="middle" font-size="4.5" fill="#84344C">容易陷入工作</text>
        <rect x="112" y="86" width="46" height="14" rx="3" fill="#3E5A78" />
        <text x="135" y="96" text-anchor="middle" font-size="5.5" font-weight="700" fill="#fff">自我怀疑区</text>
        <text x="135" y="108" text-anchor="middle" font-size="4.5" fill="#3E5A78">容易迷茫失控</text>
        <defs>
          <marker id="wsz-t-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0 1.5 L9 5 L0 8.5 z" fill="#A84562" />
          </marker>
        </defs>
        <line x1="100" y1="118" x2="100" y2="24" stroke="#A84562" stroke-width="1.2" marker-end="url(#wsz-t-arr)" />
        <line x1="28" y1="68" x2="172" y2="68" stroke="#A84562" stroke-width="1.2" marker-end="url(#wsz-t-arr)" />
      </svg>


      <!-- 线上线下沟通：线上/线下 × 异步/同步 -->
      <svg
        v-else-if="templateId === 'online-offline-comm'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <text x="100" y="14" text-anchor="middle" font-size="8" font-weight="800" fill="#202124">线上</text>
        <text x="14" y="76" text-anchor="middle" font-size="6.5" font-weight="800" fill="#202124">异步</text>
        <text x="186" y="76" text-anchor="middle" font-size="6.5" font-weight="800" fill="#202124">同步</text>
        <text x="100" y="134" text-anchor="middle" font-size="8" font-weight="800" fill="#202124">线下</text>
        <!-- TL blue -->
        <ellipse cx="55" cy="36" rx="28" ry="10" fill="#E8F1FA" stroke="#c5c9ce" stroke-width="2" />
        <text x="55" y="39" text-anchor="middle" font-size="5.5" font-weight="700" fill="#111">顶层文档</text>
        <ellipse cx="78" cy="54" rx="18" ry="8" fill="#E8F1FA" stroke="#c5c9ce" stroke-width="2" />
        <text x="78" y="56.5" text-anchor="middle" font-size="4.5" font-weight="700" fill="#111">电子看板</text>
        <ellipse cx="48" cy="58" rx="16" ry="7" fill="#E8F1FA" />
        <text x="48" y="60" text-anchor="middle" font-size="4.5" fill="#111">项目群</text>
        <!-- TR green -->
        <ellipse cx="138" cy="38" rx="22" ry="9" fill="#E7F6EF" />
        <text x="138" y="41" text-anchor="middle" font-size="5" fill="#111">1v1发消息</text>
        <ellipse cx="155" cy="54" rx="16" ry="7" fill="#E7F6EF" />
        <text x="155" y="56.5" text-anchor="middle" font-size="4.5" fill="#111">群聊</text>
        <!-- BL purple -->
        <ellipse cx="62" cy="100" rx="24" ry="10" fill="#F3EEF8" stroke="#c5c9ce" stroke-width="2" />
        <text x="62" y="103" text-anchor="middle" font-size="5.5" font-weight="700" fill="#111">墙面看板</text>
        <!-- BR pink -->
        <ellipse cx="130" cy="88" rx="18" ry="8" fill="#FBEFF2" stroke="#c5c9ce" stroke-width="2" />
        <text x="130" y="90.5" text-anchor="middle" font-size="4.5" font-weight="700" fill="#111">攻坚小组</text>
        <ellipse cx="155" cy="102" rx="20" ry="8" fill="#FBEFF2" stroke="#c5c9ce" stroke-width="2" />
        <text x="155" y="104.5" text-anchor="middle" font-size="4.5" font-weight="700" fill="#111">坐你旁边</text>
        <ellipse cx="138" cy="116" rx="26" ry="9" fill="#FBEFF2" />
        <text x="138" y="119" text-anchor="middle" font-size="5" fill="#111">团队例会</text>
        <defs>
          <marker id="ooc-t-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0 1.5 L9 5 L0 8.5 z" fill="#202124" />
          </marker>
        </defs>
        <line x1="100" y1="118" x2="100" y2="20" stroke="#ececec" stroke-width="1.2" marker-end="url(#ooc-t-arr)" />
        <line x1="28" y1="68" x2="172" y2="68" stroke="#ececec" stroke-width="1.2" marker-end="url(#ooc-t-arr)" />
      </svg>

      <!-- 项目管理6维敏感度：六边形雷达 -->
      <svg
        v-else-if="templateId === 'pm-sensitivity-6d'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <!-- bands -->
        <polygon points="100.0,24.0 141.6,48.0 141.6,96.0 100.0,120.0 58.4,96.0 58.4,48.0" fill="#f0f1f3" />
        <polygon points="100.0,36.0 131.2,54.0 131.2,90.0 100.0,108.0 68.8,90.0 68.8,54.0" fill="#ffffff" />
        <polygon points="100.0,48.0 120.8,60.0 120.8,84.0 100.0,96.0 79.2,84.0 79.2,60.0" fill="#f0f1f3" />
        <polygon points="100.0,60.0 110.4,66.0 110.4,78.0 100.0,84.0 89.6,78.0 89.6,66.0" fill="#ffffff" />
        <polygon points="100.0,24.0 141.6,48.0 141.6,96.0 100.0,120.0 58.4,96.0 58.4,48.0" fill="none" stroke="#d0d4d9" stroke-width="1" />
        <polygon points="100.0,36.0 131.2,54.0 131.2,90.0 100.0,108.0 68.8,90.0 68.8,54.0" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <polygon points="100.0,48.0 120.8,60.0 120.8,84.0 100.0,96.0 79.2,84.0 79.2,60.0" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <line x1="100" y1="72" x2="100" y2="24" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100" y1="72" x2="141.6" y2="48" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100" y1="72" x2="141.6" y2="96" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100" y1="72" x2="100" y2="120" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100" y1="72" x2="58.4" y2="96" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100" y1="72" x2="58.4" y2="48" stroke="#c5c9ce" stroke-width="0.8" />
        <!-- data poly: budget4 boss1 risk2 collab1 manpower2 time4 -->
        <polygon points="100.0,24.0 110.4,66.0 120.8,84.0 100.0,84.0 79.2,84.0 58.4,48.0" fill="rgba(42,100,159,0.28)" stroke="#2A649F" stroke-width="1.3" />
        <rect x="97" y="21" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="107.4" y="63" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="117.8" y="81" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="97" y="81" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="76.2" y="81" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="55.4" y="45" width="6" height="6" rx="1" fill="#2A649F" />
        <text x="100" y="14" text-anchor="middle" font-size="6.5" font-weight="700" fill="#3c4043">预算敏感</text>
        <text x="168" y="42" text-anchor="middle" font-size="5.5" font-weight="700" fill="#3c4043">老板敏感</text>
        <text x="168" y="108" text-anchor="middle" font-size="5.5" font-weight="700" fill="#3c4043">风险敏感</text>
        <text x="100" y="134" text-anchor="middle" font-size="6.5" font-weight="700" fill="#3c4043">协作敏感</text>
        <text x="32" y="108" text-anchor="middle" font-size="5.5" font-weight="700" fill="#3c4043">人力敏感</text>
        <text x="32" y="42" text-anchor="middle" font-size="5.5" font-weight="700" fill="#3c4043">时间敏感</text>
      </svg>


      <!-- 项目管理竞争力测评：五边形雷达 -->
      <svg
        v-else-if="templateId === 'pm-competency'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <polygon points="100.0,24.0 145.7,57.2 128.2,110.8 71.8,110.8 54.3,57.2" fill="none" stroke="#d0d4d9" stroke-width="1" />
        <polygon points="100.0,36.0 134.2,60.9 121.2,101.1 78.8,101.1 65.8,60.9" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <polygon points="100.0,48.0 122.8,64.6 114.1,91.4 85.9,91.4 77.2,64.6" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <polygon points="100.0,60.0 111.4,68.3 107.1,81.7 92.9,81.7 88.6,68.3" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <line x1="100.0" y1="72.0" x2="100.0" y2="24.0" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100.0" y1="72.0" x2="145.7" y2="57.2" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100.0" y1="72.0" x2="128.2" y2="110.8" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100.0" y1="72.0" x2="71.8" y2="110.8" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100.0" y1="72.0" x2="54.3" y2="57.2" stroke="#c5c9ce" stroke-width="0.8" />
        <polygon points="100.0,24.0 134.2,60.9 107.1,81.7 78.8,101.1 54.3,57.2" fill="rgba(42,100,159,0.28)" stroke="#42a5f5" stroke-width="1.3" />
        <rect x="97.0" y="21.0" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="131.2" y="57.9" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="104.1" y="78.7" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="75.8" y="98.1" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="51.3" y="54.2" width="6" height="6" rx="1" fill="#2A649F" />
        <text x="100.0" y="8.0" text-anchor="middle" font-size="5.5" font-weight="700" fill="#3c4043">项目管理意识</text>
        <text x="159.0" y="52.8" text-anchor="start" font-size="5.5" font-weight="700" fill="#3c4043">做复盘</text>
        <text x="136.4" y="122.2" text-anchor="start" font-size="5.5" font-weight="700" fill="#3c4043">管执行</text>
        <text x="63.6" y="122.2" text-anchor="end" font-size="5.5" font-weight="700" fill="#3c4043">拆计划</text>
        <text x="41.0" y="52.8" text-anchor="end" font-size="5.5" font-weight="700" fill="#3c4043">定方案</text>
      </svg>


      <!-- 产品内容5维特征：五边形雷达 -->
      <svg
        v-else-if="templateId === 'product-features-5d'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <polygon points="100.0,24.0 145.7,57.2 128.2,110.8 71.8,110.8 54.3,57.2" fill="none" stroke="#d0d4d9" stroke-width="1" />
        <polygon points="100.0,33.6 136.5,60.1 122.6,103.1 77.4,103.1 63.5,60.1" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <polygon points="100.0,43.2 127.4,63.1 116.9,95.3 83.1,95.3 72.6,63.1" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <polygon points="100.0,52.8 118.3,66.1 111.3,87.5 88.7,87.5 81.7,66.1" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <polygon points="100.0,62.4 109.1,69.0 105.6,79.8 94.4,79.8 90.9,69.0" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <line x1="100.0" y1="72.0" x2="100.0" y2="24.0" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100.0" y1="72.0" x2="145.7" y2="57.2" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100.0" y1="72.0" x2="128.2" y2="110.8" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100.0" y1="72.0" x2="71.8" y2="110.8" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100.0" y1="72.0" x2="54.3" y2="57.2" stroke="#c5c9ce" stroke-width="0.8" />
        <polygon points="100.0,24.0 127.4,63.1 111.3,87.5 85.9,91.4 54.3,57.2" fill="rgba(42,100,159,0.28)" stroke="#2A649F" stroke-width="1.3" />
        <rect x="97.0" y="21.0" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="124.4" y="60.1" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="108.3" y="84.5" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="82.9" y="88.4" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="51.3" y="54.2" width="6" height="6" rx="1" fill="#2A649F" />
        <text x="100.0" y="14.0" text-anchor="middle" font-size="5.5" font-weight="700" fill="#3c4043">开放性</text>
        <text x="162.0" y="52.0" text-anchor="start" font-size="5.5" font-weight="700" fill="#3c4043">投入性</text>
        <text x="148.0" y="124.0" text-anchor="start" font-size="5.5" font-weight="700" fill="#3c4043">易错性</text>
        <text x="52.0" y="124.0" text-anchor="end" font-size="5.5" font-weight="700" fill="#3c4043">迭代性</text>
        <text x="38.0" y="52.0" text-anchor="end" font-size="5.5" font-weight="700" fill="#3c4043">创新性</text>
      </svg>

      <!-- 项目管理方案评估三角形：等边三角雷达 -->
      <svg
        v-else-if="templateId === 'pm-solution-triangle'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <polygon points="100.0,28.0 143.3,103.0 56.7,103.0" fill="#f0f1f3" />
        <polygon points="100.0,40.5 132.5,96.8 67.5,96.8" fill="#ffffff" />
        <polygon points="100.0,53.0 121.7,90.5 78.3,90.5" fill="#f0f1f3" />
        <polygon points="100.0,65.5 110.8,84.2 89.2,84.2" fill="#ffffff" />
        <polygon points="100.0,28.0 143.3,103.0 56.7,103.0" fill="none" stroke="#d0d4d9" stroke-width="1" />
        <polygon points="100.0,40.5 132.5,96.8 67.5,96.8" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <polygon points="100.0,53.0 121.7,90.5 78.3,90.5" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <polygon points="100.0,65.5 110.8,84.2 89.2,84.2" fill="none" stroke="#d0d4d9" stroke-width="0.8" />
        <line x1="100.0" y1="78.0" x2="100.0" y2="28.0" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100.0" y1="78.0" x2="143.3" y2="103.0" stroke="#c5c9ce" stroke-width="0.8" />
        <line x1="100.0" y1="78.0" x2="56.7" y2="103.0" stroke="#c5c9ce" stroke-width="0.8" />
        <polygon points="100.0,43.0 121.7,90.5 61.0,100.5" fill="rgba(42,100,159,0.28)" stroke="#2A649F" stroke-width="1.3" />
        <rect x="97.0" y="40.0" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="118.7" y="87.5" width="6" height="6" rx="1" fill="#2A649F" />
        <rect x="58.0" y="97.5" width="6" height="6" rx="1" fill="#2A649F" />
        <text x="100" y="16" text-anchor="middle" font-size="6" font-weight="700" fill="#3c4043">投入产出比ROI</text>
        <text x="36" y="122" text-anchor="middle" font-size="6" font-weight="700" fill="#3c4043">机会成本</text>
        <text x="164" y="122" text-anchor="middle" font-size="6" font-weight="700" fill="#3c4043">机会窗口</text>
      </svg>





      <!-- 个人年工作总结：三节纵向 -->
      <svg
        v-else-if="templateId === 'annual-summary'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <text x="12" y="16" font-size="7" font-weight="800" fill="#202124">个人年工作总结模板</text>
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

      <!-- 个人周工作总结：三节纵向 -->
      <svg
        v-else-if="templateId === 'weekly-summary'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <text x="12" y="16" font-size="7" font-weight="800" fill="#202124">个人周工作总结模板</text>
        <text x="12" y="34" font-size="6.5" font-weight="800" fill="#202124">本周关键执行</text>
        <line x1="12" y1="40" x2="12" y2="52" stroke="#dadce0" stroke-width="1.5" />
        <text x="18" y="48" font-size="5" font-style="italic" fill="#9aa0a6">关键事项 TOP3…</text>
        <rect x="12" y="54" width="176" height="14" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
        <text x="12" y="82" font-size="6.5" font-weight="800" fill="#202124">卡点与应对</text>
        <line x1="12" y1="88" x2="12" y2="98" stroke="#dadce0" stroke-width="1.5" />
        <rect x="12" y="100" width="176" height="10" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
        <text x="12" y="124" font-size="6.5" font-weight="800" fill="#202124">下周优先事项</text>
        <rect x="12" y="128" width="176" height="6" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
      </svg>

      <!-- 个人月工作总结：三节纵向 -->
      <svg
        v-else-if="templateId === 'monthly-summary'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <text x="12" y="16" font-size="7" font-weight="800" fill="#202124">个人月工作总结模板</text>
        <text x="12" y="34" font-size="6.5" font-weight="800" fill="#202124">目标完成情况</text>
        <line x1="12" y1="40" x2="12" y2="52" stroke="#dadce0" stroke-width="1.5" />
        <text x="18" y="48" font-size="5" font-style="italic" fill="#9aa0a6">对照目标 TOP3…</text>
        <rect x="12" y="54" width="176" height="14" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
        <text x="12" y="82" font-size="6.5" font-weight="800" fill="#202124">关键进展与贡献</text>
        <line x1="12" y1="88" x2="12" y2="98" stroke="#dadce0" stroke-width="1.5" />
        <rect x="12" y="100" width="176" height="10" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
        <text x="12" y="124" font-size="6.5" font-weight="800" fill="#202124">差距与下月计划</text>
        <rect x="12" y="128" width="176" height="6" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
      </svg>

      <!-- 个人季工作总结：三节纵向 -->
      <svg
        v-else-if="templateId === 'quarterly-summary'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <text x="12" y="16" font-size="7" font-weight="800" fill="#202124">个人季工作总结模板</text>
        <text x="12" y="34" font-size="6.5" font-weight="800" fill="#202124">阶段性成果</text>
        <line x1="12" y1="40" x2="12" y2="52" stroke="#dadce0" stroke-width="1.5" />
        <text x="18" y="48" font-size="5" font-style="italic" fill="#9aa0a6">可量化成果 TOP3…</text>
        <rect x="12" y="54" width="176" height="14" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
        <text x="12" y="82" font-size="6.5" font-weight="800" fill="#202124">能力与方法沉淀</text>
        <line x1="12" y1="88" x2="12" y2="98" stroke="#dadce0" stroke-width="1.5" />
        <rect x="12" y="100" width="176" height="10" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
        <text x="12" y="124" font-size="6.5" font-weight="800" fill="#202124">下季度方向</text>
        <rect x="12" y="128" width="176" height="6" fill="#fafafa" stroke="#e8eaed" stroke-width="0.6" />
      </svg>

      <!-- 深度复盘关键成果：网格 -->
      <svg
        v-else-if="templateId === 'deep-review'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="8" y="8" width="184" height="16" fill="#FBF6E4" stroke="#ececec" stroke-width="1" />
        <text x="14" y="19" font-size="5.5" font-weight="700" fill="#202124">项目名称：____　复盘时间：____</text>
        <rect x="8" y="24" width="184" height="22" fill="#fff" stroke="#ececec" stroke-width="1" />
        <text x="14" y="34" font-size="6" font-weight="800" fill="#202124">整体评价</text>
        <rect x="8" y="46" width="92" height="28" fill="#fff" stroke="#ececec" stroke-width="1" />
        <rect x="100" y="46" width="92" height="28" fill="#fff" stroke="#ececec" stroke-width="1" />
        <text x="14" y="58" font-size="6" font-weight="800" fill="#202124">亮点共识</text>
        <text x="106" y="58" font-size="6" font-weight="800" fill="#202124">问题共识</text>
        <rect x="8" y="74" width="61" height="28" fill="#fff" stroke="#ececec" stroke-width="1" />
        <rect x="69" y="74" width="61" height="28" fill="#fff" stroke="#ececec" stroke-width="1" />
        <rect x="130" y="74" width="62" height="28" fill="#fff" stroke="#ececec" stroke-width="1" />
        <text x="14" y="86" font-size="5.5" font-weight="800" fill="#202124">坚持做</text>
        <text x="75" y="86" font-size="5.5" font-weight="800" fill="#202124">放弃做</text>
        <text x="136" y="86" font-size="5.5" font-weight="800" fill="#202124">新任务</text>
        <rect x="8" y="102" width="184" height="28" fill="#fff" stroke="#ececec" stroke-width="1" />
        <text x="14" y="114" font-size="6" font-weight="800" fill="#202124">过程资产</text>
      </svg>



      <!-- 项目管理复盘挖掘价值：Before/After 双栏 -->
      <svg
        v-else-if="templateId === 'pm-retro-value'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#FBF6E4" />
        <rect x="8" y="8" width="184" height="18" fill="#1f1f1f" />
        <text x="100" y="20" text-anchor="middle" font-size="6.5" font-weight="700" fill="#ffffff">复盘挖掘价值4：过程资产</text>
        <rect x="8" y="26" width="90" height="16" fill="#0E8A84" />
        <rect x="102" y="26" width="90" height="16" fill="#A67C00" />
        <text x="53" y="37" text-anchor="middle" font-size="5.5" font-weight="800" fill="#fff">Before: LEO不挖</text>
        <text x="147" y="37" text-anchor="middle" font-size="5.5" font-weight="800" fill="#fff">After: LEO认真挖</text>
        <rect x="8" y="42" width="90" height="90" fill="#FBF6E4" stroke="#ffffff" stroke-width="1.5" />
        <rect x="102" y="42" width="90" height="90" fill="#FBF6E4" stroke="#ffffff" stroke-width="1.5" />
        <text x="53" y="90" text-anchor="middle" font-size="5" fill="#202124">"下次我就有经验了"</text>
        <text x="110" y="58" font-size="5" font-weight="700" fill="#A84562">关键的方法：</text>
        <text x="110" y="70" font-size="4.5" fill="#202124">1. 评价工具质量…</text>
        <text x="110" y="82" font-size="4.5" fill="#202124">2. 二维码卖点…</text>
        <text x="110" y="96" font-size="5" font-weight="700" fill="#A84562">关键的清单：</text>
        <text x="110" y="108" font-size="4.5" fill="#202124">1. VI规范清单</text>
        <text x="110" y="120" font-size="5" font-weight="700" fill="#A84562">关键执行SOP</text>
      </svg>

      <!-- 单元模型象限：米色底十字轴四色标题 -->
      <svg
        v-else-if="templateId === 'unit-model-quadrant'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <text x="100" y="14" text-anchor="middle" font-size="6.5" font-weight="800" fill="#202124">单元模型长期成立</text>
        <text x="18" y="76" text-anchor="middle" font-size="5.5" font-weight="800" fill="#202124">公司账不成立</text>
        <text x="182" y="76" text-anchor="middle" font-size="5.5" font-weight="800" fill="#202124">公司账长期成立</text>
        <text x="100" y="134" text-anchor="middle" font-size="6.5" font-weight="800" fill="#202124">单元模型不成立</text>
        <line x1="100" y1="126" x2="100" y2="20" stroke="#c5c9ce" stroke-width="1.6" marker-end="url(#umq-thumb-arrow)" />
        <line x1="28" y1="72" x2="172" y2="72" stroke="#c5c9ce" stroke-width="1.6" marker-end="url(#umq-thumb-arrow)" />
        <defs>
          <marker id="umq-thumb-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 1 L 11 6 L 0 11 z" fill="#111" />
          </marker>
        </defs>
        <text x="55" y="48" text-anchor="middle" font-size="6" font-weight="800" fill="#A67C00">总部成本过高</text>
        <text x="145" y="48" text-anchor="middle" font-size="7" font-weight="800" fill="#0E8A84">健康模型</text>
        <text x="55" y="100" text-anchor="middle" font-size="6" font-weight="800" fill="#A84562">放弃 or 调整</text>
        <text x="145" y="100" text-anchor="middle" font-size="7" font-weight="800" fill="#B85A38">不存在</text>
      </svg>


      <!-- 综合决策ROI权衡：黄头双栏收益/成本 -->
      <svg
        v-else-if="templateId === 'roi-tradeoff'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#FBF6E4" />
        <rect x="8" y="10" width="90" height="18" fill="#187A4E" />
        <rect x="102" y="10" width="90" height="18" fill="#A84562" />
        <text x="18" y="22" font-size="7" font-weight="800" fill="#fff">关键收益</text>
        <text x="112" y="22" font-size="7" font-weight="800" fill="#fff">关键成本</text>
        <rect x="8" y="28" width="90" height="102" fill="#E7F6EF" />
        <rect x="102" y="28" width="90" height="102" fill="#FBEFF2" />
        <text x="16" y="46" font-size="5.5" fill="#202124">1.</text>
        <text x="16" y="60" font-size="5.5" fill="#202124">2.</text>
        <text x="16" y="74" font-size="5.5" fill="#202124">3.</text>
        <text x="16" y="88" font-size="5.5" fill="#202124">4.</text>
        <text x="16" y="102" font-size="5.5" fill="#202124">5.</text>
        <text x="16" y="116" font-size="5.5" fill="#202124">6.</text>
        <text x="110" y="46" font-size="5.5" fill="#202124">1.</text>
        <text x="110" y="60" font-size="5.5" fill="#202124">2.</text>
        <text x="110" y="74" font-size="5.5" fill="#202124">3.</text>
        <text x="110" y="88" font-size="5.5" fill="#202124">4.</text>
        <text x="110" y="102" font-size="5.5" fill="#202124">5.</text>
        <text x="110" y="116" font-size="5.5" fill="#202124">6.</text>
      </svg>


      <!-- ROI决策评估：蓝头矩阵缩略 -->
      <svg
        v-else-if="templateId === 'roi-decision'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#E8F1FA" />
        <!-- top headers -->
        <rect x="8" y="8" width="40" height="14" fill="#2A649F" stroke="#ececec" stroke-width="0.6" />
        <rect x="48" y="8" width="68" height="14" fill="#2A649F" stroke="#ececec" stroke-width="0.6" />
        <rect x="116" y="8" width="68" height="14" fill="#2A649F" stroke="#ececec" stroke-width="0.6" />
        <text x="28" y="18" text-anchor="middle" font-size="6" font-weight="800" fill="#fff">维度</text>
        <text x="82" y="18" text-anchor="middle" font-size="6" font-weight="800" fill="#fff">收益项</text>
        <text x="150" y="18" text-anchor="middle" font-size="6" font-weight="800" fill="#fff">成本项</text>
        <!-- rows -->
        <rect x="8" y="22" width="40" height="28" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <rect x="48" y="22" width="68" height="28" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <rect x="116" y="22" width="68" height="28" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <text x="28" y="38" text-anchor="middle" font-size="5.5" font-weight="700" fill="#111">基础ROI</text>
        <rect x="8" y="50" width="40" height="14" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <rect x="48" y="50" width="68" height="14" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <rect x="116" y="50" width="68" height="14" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <text x="28" y="60" text-anchor="middle" font-size="5" font-weight="700" fill="#111">长期视角</text>
        <rect x="8" y="64" width="40" height="14" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <rect x="48" y="64" width="68" height="14" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <rect x="116" y="64" width="68" height="14" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <text x="28" y="74" text-anchor="middle" font-size="5" font-weight="700" fill="#111">公司视角</text>
        <!-- middle -->
        <rect x="8" y="82" width="88" height="12" fill="#B85A38" />
        <rect x="96" y="82" width="88" height="12" fill="#187A4E" />
        <text x="52" y="91" text-anchor="middle" font-size="5.5" font-weight="800" fill="#fff">机会成本</text>
        <text x="140" y="91" text-anchor="middle" font-size="5.5" font-weight="800" fill="#fff">时间窗口</text>
        <rect x="8" y="94" width="88" height="16" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <rect x="96" y="94" width="88" height="16" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <!-- conclusion -->
        <rect x="8" y="114" width="176" height="18" fill="#E8F1FA" stroke="#ececec" stroke-width="0.6" />
        <text x="16" y="126" font-size="5.5" font-weight="800" fill="#111">最终结论</text>
      </svg>


      <!-- 科学开会十大原则：十瓣花 -->
      <svg
        v-else-if="templateId === 'scientific-meeting-10p'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="sm10p-t-stripes" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#d8d8d8" stroke-width="0.8" opacity="0.6" />
          </pattern>
        </defs>
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect width="200" height="140" rx="10" fill="url(#sm10p-t-stripes)" />
        <!-- simplified petals (fixed mid scores) -->
        <g transform="translate(100,72)">
          <path d="M0,0 L-8,-8 Q-22,-48 0,-52 Q22,-48 8,-8 Z" fill="#187A4E" opacity="0.95" />
          <path d="M0,0 L6,-10 Q40,-38 48,-28 Q36,-12 10,-4 Z" fill="#6A7818" opacity="0.95" />
          <path d="M0,0 L10,-4 Q48,-10 50,2 Q38,14 8,8 Z" fill="#A67C00" opacity="0.95" />
          <path d="M0,0 L8,8 Q36,28 28,42 Q10,36 -2,10 Z" fill="#A84562" opacity="0.95" />
          <path d="M0,0 L-2,10 Q8,42 -8,48 Q-22,34 -10,8 Z" fill="#7A3E86" opacity="0.95" />
          <path d="M0,0 L-10,8 Q-30,34 -42,22 Q-36,6 -8,-2 Z" fill="#6B4C9A" opacity="0.95" />
          <path d="M0,0 L-8,-2 Q-48,-2 -48,-14 Q-34,-24 -6,-10 Z" fill="#3E5A78" opacity="0.95" />
          <path d="M0,0 L-6,-10 Q-34,-34 -22,-46 Q-6,-38 2,-10 Z" fill="#2A649F" opacity="0.95" />
          <path d="M0,0 L2,-10 Q18,-42 32,-36 Q28,-18 8,-6 Z" fill="#0E8A84" opacity="0.9" />
          <path d="M0,0 L8,-6 Q28,-22 36,-8 Q24,4 6,2 Z" fill="#1A7088" opacity="0.9" />
          <circle cx="0" cy="0" r="6" fill="#ffffff" stroke="#e0e0e0" stroke-width="0.8" />
        </g>
        <text x="100" y="18" text-anchor="middle" font-size="7" font-weight="800" fill="#3c4043">十大原则</text>
      </svg>

      <!-- 业务公式：浅色树图缩略（白灰底） -->
      <svg
        v-else-if="templateId === 'business-formula'"
        class="thumb-svg"
        viewBox="0 0 200 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="200" height="140" rx="10" fill="#f7f7f7" />
        <rect x="18" y="52" width="48" height="22" rx="6" fill="#ffffff" stroke="#A84562" stroke-width="1.4" />
        <rect x="92" y="28" width="48" height="22" rx="6" fill="#ffffff" stroke="#B85A38" stroke-width="1.2" />
        <rect x="92" y="60" width="48" height="22" rx="6" fill="#ffffff" stroke="#187A4E" stroke-width="1.2" />
        <rect x="92" y="92" width="48" height="22" rx="6" fill="#ffffff" stroke="#2A649F" stroke-width="1.2" />
        <path d="M66 63 C78 63, 82 39, 92 39" fill="none" stroke="#B85A38" stroke-width="1.4" opacity="0.85" />
        <path d="M66 63 C78 63, 82 71, 92 71" fill="none" stroke="#187A4E" stroke-width="1.4" opacity="0.85" />
        <path d="M66 63 C78 63, 82 103, 92 103" fill="none" stroke="#2A649F" stroke-width="1.4" opacity="0.85" />
        <circle cx="79" cy="48" r="5" fill="#6B4C9A" />
        <circle cx="79" cy="67" r="5" fill="#187A4E" />
        <circle cx="79" cy="90" r="5" fill="#1A7088" />
        <text x="42" y="67" text-anchor="middle" font-size="7" font-weight="700" fill="#202124">收入</text>
        <text x="116" y="43" text-anchor="middle" font-size="6.5" fill="#202124">流量</text>
        <text x="116" y="75" text-anchor="middle" font-size="6.5" fill="#202124">转化</text>
        <text x="116" y="107" text-anchor="middle" font-size="6.5" fill="#202124">客单</text>
      </svg>

  </div>
</template>

<style scoped>
.thumb {
  aspect-ratio: 200 / 140;
  background: #f1f3f4;
  border-bottom: 1px solid #e8eaed;
}

.thumb-svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* Aside recent-doc: mini template mark, same SVG language as left cards */
.thumb--sm {
  width: 20px;
  height: 20px;
  aspect-ratio: auto;
  border-bottom: 0;
  border-radius: 5px;
  overflow: hidden;
  background: transparent;
  flex-shrink: 0;
}

.thumb--sm .thumb-svg {
  width: 28px;
  height: 20px;
  margin-left: -4px;
  /* slight crop to keep center composition readable at 20px */
}
</style>
