<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDocumentStore } from '../../stores/document'
import { useUiStore } from '../../stores/ui'
import {
  isDeliberatePracticeDoc,
  isDemandTriangleDoc,
  isDualTriangleDoc,
  isAiTradeoffDoc,
  isFiveStepDoc,
  isIndustryAnalysisDoc,
  isIndustryForecastDoc,
  isKeyResistanceDoc,
  isConversionTradeoffDoc,
  isOscarDoc,
  isProductContentDoc,
  isQuadrantDoc,
  isScientificMeetingDoc,
  isIpoDoc,
  isIncidentReviewDoc,
  isAnnualSummaryDoc,
  isDeepReviewDoc,
  isYModelDoc,
} from '../../types/canvas'
import BackgroundLayer from './BackgroundLayer.vue'
import QuadrantGrid from './QuadrantGrid.vue'
import AxesLayer from './AxesLayer.vue'
import MarkersLayer from './MarkersLayer.vue'
import DualTriangleCanvas from './DualTriangleCanvas.vue'
import YModelCanvas from './YModelCanvas.vue'
import DeliberatePracticeCanvas from './DeliberatePracticeCanvas.vue'
import DemandTriangleCanvas from './DemandTriangleCanvas.vue'
import FiveStepCanvas from './FiveStepCanvas.vue'
import AiTradeoffCanvas from './AiTradeoffCanvas.vue'
import ProductContentCanvas from './ProductContentCanvas.vue'
import OscarCanvas from './OscarCanvas.vue'
import IndustryAnalysisCanvas from './IndustryAnalysisCanvas.vue'
import KeyResistanceCanvas from './KeyResistanceCanvas.vue'
import ConversionTradeoffCanvas from './ConversionTradeoffCanvas.vue'
import IndustryForecastCanvas from './IndustryForecastCanvas.vue'
import ScientificMeetingCanvas from './ScientificMeetingCanvas.vue'
import IpoCanvas from './IpoCanvas.vue'
import IncidentReviewCanvas from './IncidentReviewCanvas.vue'
import AnnualSummaryCanvas from './AnnualSummaryCanvas.vue'
import DeepReviewCanvas from './DeepReviewCanvas.vue'

const documentStore = useDocumentStore()
const ui = useUiStore()
const { current_data } = storeToRefs(documentStore)
const { zoom } = storeToRefs(ui)

const dualDoc = computed(() =>
  isDualTriangleDoc(current_data.value) ? current_data.value : null,
)
const yModelDoc = computed(() =>
  isYModelDoc(current_data.value) ? current_data.value : null,
)
const deliberateDoc = computed(() =>
  isDeliberatePracticeDoc(current_data.value) ? current_data.value : null,
)
const demandDoc = computed(() =>
  isDemandTriangleDoc(current_data.value) ? current_data.value : null,
)
const fiveStepDoc = computed(() =>
  isFiveStepDoc(current_data.value) ? current_data.value : null,
)
const aiTradeoffDoc = computed(() =>
  isAiTradeoffDoc(current_data.value) ? current_data.value : null,
)
const productContentDoc = computed(() =>
  isProductContentDoc(current_data.value) ? current_data.value : null,
)
const oscarDoc = computed(() =>
  isOscarDoc(current_data.value) ? current_data.value : null,
)
const industryAnalysisDoc = computed(() =>
  isIndustryAnalysisDoc(current_data.value) ? current_data.value : null,
)
const keyResistanceDoc = computed(() =>
  isKeyResistanceDoc(current_data.value) ? current_data.value : null,
)
const conversionTradeoffDoc = computed(() =>
  isConversionTradeoffDoc(current_data.value) ? current_data.value : null,
)
const industryForecastDoc = computed(() =>
  isIndustryForecastDoc(current_data.value) ? current_data.value : null,
)
const scientificMeetingDoc = computed(() =>
  isScientificMeetingDoc(current_data.value) ? current_data.value : null,
)
const ipoDoc = computed(() =>
  isIpoDoc(current_data.value) ? current_data.value : null,
)
const incidentReviewDoc = computed(() =>
  isIncidentReviewDoc(current_data.value) ? current_data.value : null,
)
const annualSummaryDoc = computed(() =>
  isAnnualSummaryDoc(current_data.value) ? current_data.value : null,
)
const deepReviewDoc = computed(() =>
  isDeepReviewDoc(current_data.value) ? current_data.value : null,
)
const quadrantDoc = computed(() =>
  isQuadrantDoc(current_data.value) ? current_data.value : null,
)
</script>

<template>
  <div class="viewport-shell">
    <div class="canvas-stage">
      <div
        v-if="current_data"
        class="canvas-viewport"
        data-export-root
        :style="{ transform: `scale(${zoom})` }"
      >
        <template v-if="dualDoc">
          <DualTriangleCanvas :doc="dualDoc" />
        </template>
        <template v-else-if="yModelDoc">
          <YModelCanvas :doc="yModelDoc" />
        </template>
        <template v-else-if="deliberateDoc">
          <DeliberatePracticeCanvas :doc="deliberateDoc" />
        </template>
        <template v-else-if="demandDoc">
          <DemandTriangleCanvas :doc="demandDoc" />
        </template>
        <template v-else-if="fiveStepDoc">
          <FiveStepCanvas :doc="fiveStepDoc" />
        </template>
        <template v-else-if="aiTradeoffDoc">
          <AiTradeoffCanvas :doc="aiTradeoffDoc" />
        </template>
        <template v-else-if="productContentDoc">
          <ProductContentCanvas :doc="productContentDoc" />
        </template>
        <template v-else-if="oscarDoc">
          <OscarCanvas :doc="oscarDoc" />
        </template>
        <template v-else-if="industryAnalysisDoc">
          <IndustryAnalysisCanvas :doc="industryAnalysisDoc" />
        </template>
        <template v-else-if="keyResistanceDoc">
          <KeyResistanceCanvas :doc="keyResistanceDoc" />
        </template>
        <template v-else-if="conversionTradeoffDoc">
          <ConversionTradeoffCanvas :doc="conversionTradeoffDoc" />
        </template>
        <template v-else-if="industryForecastDoc">
          <IndustryForecastCanvas :doc="industryForecastDoc" />
        </template>
        <template v-else-if="scientificMeetingDoc">
          <ScientificMeetingCanvas :doc="scientificMeetingDoc" />
        </template>
        <template v-else-if="ipoDoc">
          <IpoCanvas :doc="ipoDoc" />
        </template>
        <template v-else-if="incidentReviewDoc">
          <IncidentReviewCanvas :doc="incidentReviewDoc" />
        </template>
        <template v-else-if="annualSummaryDoc">
          <AnnualSummaryCanvas :doc="annualSummaryDoc" />
        </template>
        <template v-else-if="deepReviewDoc">
          <DeepReviewCanvas :doc="deepReviewDoc" />
        </template>
        <template v-else-if="quadrantDoc">
          <BackgroundLayer :background="quadrantDoc.theme.background" />
          <QuadrantGrid :quadrants="quadrantDoc.quadrants" />
          <AxesLayer :axes="quadrantDoc.axes" />
          <MarkersLayer :markers="quadrantDoc.markers" />
        </template>
      </div>
      <div v-else class="empty">尚未加载画布文档</div>
    </div>
  </div>
</template>

<style scoped>
.viewport-shell {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #e8eaed;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
}

.canvas-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  overflow: hidden;
}

.canvas-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: min(var(--canvas-min-width, 640px), 100%);
  min-height: min(var(--canvas-min-height, 480px), 100%);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
  transform-origin: center center;
  background: #fcfcfc;
}

.empty {
  margin: auto;
  color: #5f6368;
  font-size: 14px;
}
</style>
