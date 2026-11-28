<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { storeToRefs } from 'pinia'
import { useDocumentStore } from '../../stores/document'
import { useUiStore } from '../../stores/ui'
import {
  isDeliberatePracticeDoc,
  isDemandTriangleDoc,
  isDualTriangleDoc,
  isAiTradeoffDoc,
  isFiveStepDoc,
  isFiveStepDivisionDoc,
  isFiveStepBasicDoc,
  isFiveStepAdvancedDoc,
  isFiveStepProDoc,
  isFiveStepChallengeDoc,
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
  isPeriodSummaryDoc,
  isDeepReviewDoc,
  isPmRetroValueDoc,
  isRoiTradeoffDoc,
  isRoiDecisionDoc,
  isTimeMatrixDoc,
  isWorkStateZonesDoc,
  isOnlineOfflineCommDoc,
  isUnitModelQuadrantDoc,
  isPmSensitivity6dDoc,
  isPmCompetencyDoc,
  isScientificMeeting10pDoc,
  isProductFeatures5dDoc,
  isPmSolutionTriangleDoc,
  isGrowthAssumptionsDoc,
  isBusinessFormulaDoc,
  isAbcModelDoc,
  isBusinessFormulaPatternsDoc,
  isCultivationMountainDoc,
  isHackerFiveStepsDoc,
  isThreeRingBasicsDoc,
  isLeadershipTriangleDoc,
  isContextSixElementsDoc,
  isProjectGanttDoc,
  isRaciMatrixDoc,
  isDailyKanbanDoc,
  isBusinessModelCanvasDoc,
  isCashFlowDoc,
  isSwotDoc,
  isLeanCanvasDoc,
  isValuePropositionDoc,
  isOkrDoc,
  isStakeholderDoc,
  isPdcaDoc,
  isFiveForcesDoc,
  isIncomeStatementDoc,
  isPestleDoc,
  isAnsoffDoc,
  isEmpathyDoc,
  isMarketingMixDoc,
  isBcgDoc,
  isScorecardDoc,
  isErrcDoc,
  isAarrDoc,
  isValueChainDoc,
  isSevenSDoc,
  isRiceDoc,
  isBreakEvenDoc,
  isJourneyDoc,
  isKanoDoc,
  isMoscowDoc,
  isImpactEffortDoc,
  isVrioDoc,
  isGoldenCircleDoc,
  isSoarDoc,
  isPlayingToWinDoc,
  isTenCheckDoc,
  isSceneThreeHighDoc,
  isAiBoundaryDoc,
  isFdeSheetDoc,
  isYModelDoc,
} from '../../types/canvas'
const BackgroundLayer = defineAsyncComponent(() => import('./BackgroundLayer.vue'))
const QuadrantGrid = defineAsyncComponent(() => import('./QuadrantGrid.vue'))
const AxesLayer = defineAsyncComponent(() => import('./AxesLayer.vue'))
const MarkersLayer = defineAsyncComponent(() => import('./MarkersLayer.vue'))
const DualTriangleCanvas = defineAsyncComponent(() => import('./DualTriangleCanvas.vue'))
const DualTriangleHumanAiCanvas = defineAsyncComponent(() => import('./DualTriangleHumanAiCanvas.vue'))
const YModelCanvas = defineAsyncComponent(() => import('./YModelCanvas.vue'))
const DeliberatePracticeCanvas = defineAsyncComponent(() => import('./DeliberatePracticeCanvas.vue'))
const DemandTriangleCanvas = defineAsyncComponent(() => import('./DemandTriangleCanvas.vue'))
const FiveStepCanvas = defineAsyncComponent(() => import('./FiveStepCanvas.vue'))
const FiveStepDivisionCanvas = defineAsyncComponent(() => import('./FiveStepDivisionCanvas.vue'))
const FiveStepBasicCanvas = defineAsyncComponent(() => import('./FiveStepBasicCanvas.vue'))
const FiveStepAdvancedCanvas = defineAsyncComponent(() => import('./FiveStepAdvancedCanvas.vue'))
const FiveStepProCanvas = defineAsyncComponent(() => import('./FiveStepProCanvas.vue'))
const FiveStepChallengeCanvas = defineAsyncComponent(() => import('./FiveStepChallengeCanvas.vue'))
const AiTradeoffCanvas = defineAsyncComponent(() => import('./AiTradeoffCanvas.vue'))
const ProductContentCanvas = defineAsyncComponent(() => import('./ProductContentCanvas.vue'))
const OscarCanvas = defineAsyncComponent(() => import('./OscarCanvas.vue'))
const IndustryAnalysisCanvas = defineAsyncComponent(() => import('./IndustryAnalysisCanvas.vue'))
const KeyResistanceCanvas = defineAsyncComponent(() => import('./KeyResistanceCanvas.vue'))
const ConversionTradeoffCanvas = defineAsyncComponent(() => import('./ConversionTradeoffCanvas.vue'))
const IndustryForecastCanvas = defineAsyncComponent(() => import('./IndustryForecastCanvas.vue'))
const ScientificMeetingCanvas = defineAsyncComponent(() => import('./ScientificMeetingCanvas.vue'))
const IpoCanvas = defineAsyncComponent(() => import('./IpoCanvas.vue'))
const IncidentReviewCanvas = defineAsyncComponent(() => import('./IncidentReviewCanvas.vue'))
const AnnualSummaryCanvas = defineAsyncComponent(() => import('./AnnualSummaryCanvas.vue'))
const PeriodSummaryCanvas = defineAsyncComponent(() => import('./PeriodSummaryCanvas.vue'))
const DeepReviewCanvas = defineAsyncComponent(() => import('./DeepReviewCanvas.vue'))
const PmRetroValueCanvas = defineAsyncComponent(() => import('./PmRetroValueCanvas.vue'))
const RoiTradeoffCanvas = defineAsyncComponent(() => import('./RoiTradeoffCanvas.vue'))
const RoiDecisionCanvas = defineAsyncComponent(() => import('./RoiDecisionCanvas.vue'))
const TimeMatrixCanvas = defineAsyncComponent(() => import('./TimeMatrixCanvas.vue'))
const WorkStateZonesCanvas = defineAsyncComponent(() => import('./WorkStateZonesCanvas.vue'))
const OnlineOfflineCommCanvas = defineAsyncComponent(() => import('./OnlineOfflineCommCanvas.vue'))
const UnitModelQuadrantCanvas = defineAsyncComponent(() => import('./UnitModelQuadrantCanvas.vue'))
const PmSensitivity6dCanvas = defineAsyncComponent(() => import('./PmSensitivity6dCanvas.vue'))
const PmCompetencyCanvas = defineAsyncComponent(() => import('./PmCompetencyCanvas.vue'))
const ScientificMeeting10pCanvas = defineAsyncComponent(() => import('./ScientificMeeting10pCanvas.vue'))
const ProductFeatures5dCanvas = defineAsyncComponent(() => import('./ProductFeatures5dCanvas.vue'))
const PmSolutionTriangleCanvas = defineAsyncComponent(() => import('./PmSolutionTriangleCanvas.vue'))
const GrowthAssumptionsCanvas = defineAsyncComponent(() => import('./GrowthAssumptionsCanvas.vue'))
const BusinessFormulaCanvas = defineAsyncComponent(() => import('./BusinessFormulaCanvas.vue'))
const AbcModelCanvas = defineAsyncComponent(() => import('./AbcModelCanvas.vue'))
const BusinessFormulaPatternsCanvas = defineAsyncComponent(() => import('./BusinessFormulaPatternsCanvas.vue'))
const CultivationMountainCanvas = defineAsyncComponent(() => import('./CultivationMountainCanvas.vue'))
const HackerFiveStepsCanvas = defineAsyncComponent(() => import('./HackerFiveStepsCanvas.vue'))
const ThreeRingBasicsCanvas = defineAsyncComponent(() => import('./ThreeRingBasicsCanvas.vue'))
const LeadershipTriangleCanvas = defineAsyncComponent(() => import('./LeadershipTriangleCanvas.vue'))
const ContextSixElementsCanvas = defineAsyncComponent(() => import('./ContextSixElementsCanvas.vue'))
const ProjectGanttCanvas = defineAsyncComponent(() => import('./ProjectGanttCanvas.vue'))
const RaciMatrixCanvas = defineAsyncComponent(() => import('./RaciMatrixCanvas.vue'))
const DailyKanbanCanvas = defineAsyncComponent(() => import('./DailyKanbanCanvas.vue'))
const BusinessModelCanvas = defineAsyncComponent(() => import('./BusinessModelCanvas.vue'))
const CashFlowCanvas = defineAsyncComponent(() => import('./CashFlowCanvas.vue'))
const SwotCanvas = defineAsyncComponent(() => import('./SwotCanvas.vue'))
const LeanCanvas = defineAsyncComponent(() => import('./LeanCanvas.vue'))
const ValuePropositionCanvas = defineAsyncComponent(() => import('./ValuePropositionCanvas.vue'))
const OkrCanvas = defineAsyncComponent(() => import('./OkrCanvas.vue'))
const StakeholderCanvas = defineAsyncComponent(() => import('./StakeholderCanvas.vue'))
const PdcaCanvas = defineAsyncComponent(() => import('./PdcaCanvas.vue'))
const FiveForcesCanvas = defineAsyncComponent(() => import('./FiveForcesCanvas.vue'))
const IncomeStatementCanvas = defineAsyncComponent(() => import('./IncomeStatementCanvas.vue'))
const PestleCanvas = defineAsyncComponent(() => import('./PestleCanvas.vue'))
const AnsoffCanvas = defineAsyncComponent(() => import('./AnsoffCanvas.vue'))
const EmpathyCanvas = defineAsyncComponent(() => import('./EmpathyCanvas.vue'))
const MarketingMixCanvas = defineAsyncComponent(() => import('./MarketingMixCanvas.vue'))
const BcgCanvas = defineAsyncComponent(() => import('./BcgCanvas.vue'))
const ScorecardCanvas = defineAsyncComponent(() => import('./ScorecardCanvas.vue'))
const ErrcCanvas = defineAsyncComponent(() => import('./ErrcCanvas.vue'))
const AarrCanvas = defineAsyncComponent(() => import('./AarrCanvas.vue'))
const ValueChainCanvas = defineAsyncComponent(() => import('./ValueChainCanvas.vue'))
const SevenSCanvas = defineAsyncComponent(() => import('./SevenSCanvas.vue'))
const RiceCanvas = defineAsyncComponent(() => import('./RiceCanvas.vue'))
const BreakEvenCanvas = defineAsyncComponent(() => import('./BreakEvenCanvas.vue'))
const JourneyCanvas = defineAsyncComponent(() => import('./JourneyCanvas.vue'))
const KanoCanvas = defineAsyncComponent(() => import('./KanoCanvas.vue'))
const MoscowCanvas = defineAsyncComponent(() => import('./MoscowCanvas.vue'))
const ImpactEffortCanvas = defineAsyncComponent(() => import('./ImpactEffortCanvas.vue'))
const VrioCanvas = defineAsyncComponent(() => import('./VrioCanvas.vue'))
const GoldenCircleCanvas = defineAsyncComponent(() => import('./GoldenCircleCanvas.vue'))
const SoarCanvas = defineAsyncComponent(() => import('./SoarCanvas.vue'))
const PlayingToWinCanvas = defineAsyncComponent(() => import('./PlayingToWinCanvas.vue'))
const TenCheckCanvas = defineAsyncComponent(() => import('./TenCheckCanvas.vue'))
const SceneThreeHighCanvas = defineAsyncComponent(() => import('./SceneThreeHighCanvas.vue'))
const AiBoundaryCanvas = defineAsyncComponent(() => import('./AiBoundaryCanvas.vue'))
const FdeSheetCanvas = defineAsyncComponent(() => import('./FdeSheetCanvas.vue'))

const documentStore = useDocumentStore()
const ui = useUiStore()
const { current_data, activeTemplateId } = storeToRefs(documentStore)
const { zoom } = storeToRefs(ui)

const dualDoc = computed(() =>
  isDualTriangleDoc(current_data.value) ? current_data.value : null,
)
const humanAiDoc = computed(() =>
  activeTemplateId.value === 'dual-triangle-human-ai' ? dualDoc.value : null,
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
const fiveStepDivisionDoc = computed(() =>
  isFiveStepDivisionDoc(current_data.value) ? current_data.value : null,
)
const fiveStepBasicDoc = computed(() =>
  isFiveStepBasicDoc(current_data.value) ? current_data.value : null,
)
const fiveStepAdvancedDoc = computed(() =>
  isFiveStepAdvancedDoc(current_data.value) ? current_data.value : null,
)
const fiveStepProDoc = computed(() =>
  isFiveStepProDoc(current_data.value) ? current_data.value : null,
)
const fiveStepChallengeDoc = computed(() =>
  isFiveStepChallengeDoc(current_data.value) ? current_data.value : null,
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
const periodSummaryDoc = computed(() =>
  isPeriodSummaryDoc(current_data.value) ? current_data.value : null,
)
const deepReviewDoc = computed(() =>
  isDeepReviewDoc(current_data.value) ? current_data.value : null,
)
const pmRetroValueDoc = computed(() =>
  isPmRetroValueDoc(current_data.value) ? current_data.value : null,
)
const roiTradeoffDoc = computed(() =>
  isRoiTradeoffDoc(current_data.value) ? current_data.value : null,
)
const roiDecisionDoc = computed(() =>
  isRoiDecisionDoc(current_data.value) ? current_data.value : null,
)
const timeMatrixDoc = computed(() =>
  isTimeMatrixDoc(current_data.value) ? current_data.value : null,
)
const workStateZonesDoc = computed(() =>
  isWorkStateZonesDoc(current_data.value) ? current_data.value : null,
)
const onlineOfflineCommDoc = computed(() =>
  isOnlineOfflineCommDoc(current_data.value) ? current_data.value : null,
)
const unitModelQuadrantDoc = computed(() =>
  isUnitModelQuadrantDoc(current_data.value) ? current_data.value : null,
)
const pmSensitivity6dDoc = computed(() =>
  isPmSensitivity6dDoc(current_data.value) ? current_data.value : null,
)
const pmCompetencyDoc = computed(() =>
  isPmCompetencyDoc(current_data.value) ? current_data.value : null,
)
const scientificMeeting10pDoc = computed(() =>
  isScientificMeeting10pDoc(current_data.value) ? current_data.value : null,
)
const productFeatures5dDoc = computed(() =>
  isProductFeatures5dDoc(current_data.value) ? current_data.value : null,
)
const pmSolutionTriangleDoc = computed(() =>
  isPmSolutionTriangleDoc(current_data.value) ? current_data.value : null,
)
const growthAssumptionsDoc = computed(() =>
  isGrowthAssumptionsDoc(current_data.value) ? current_data.value : null,
)
const businessFormulaDoc = computed(() =>
  isBusinessFormulaDoc(current_data.value) ? current_data.value : null,
)
const abcModelDoc = computed(() =>
  isAbcModelDoc(current_data.value) ? current_data.value : null,
)
const businessFormulaPatternsDoc = computed(() =>
  isBusinessFormulaPatternsDoc(current_data.value) ? current_data.value : null,
)
const cultivationMountainDoc = computed(() =>
  isCultivationMountainDoc(current_data.value) ? current_data.value : null,
)
const hackerFiveStepsDoc = computed(() =>
  isHackerFiveStepsDoc(current_data.value) ? current_data.value : null,
)
const threeRingBasicsDoc = computed(() =>
  isThreeRingBasicsDoc(current_data.value) ? current_data.value : null,
)
const leadershipTriangleDoc = computed(() =>
  isLeadershipTriangleDoc(current_data.value) ? current_data.value : null,
)
const contextSixElementsDoc = computed(() =>
  isContextSixElementsDoc(current_data.value) ? current_data.value : null,
)
const projectGanttDoc = computed(() =>
  isProjectGanttDoc(current_data.value) ? current_data.value : null,
)
const raciMatrixDoc = computed(() =>
  isRaciMatrixDoc(current_data.value) ? current_data.value : null,
)
const dailyKanbanDoc = computed(() =>
  isDailyKanbanDoc(current_data.value) ? current_data.value : null,
)
const businessModelCanvasDoc = computed(() =>
  isBusinessModelCanvasDoc(current_data.value) ? current_data.value : null,
)
const cashFlowDoc = computed(() =>
  isCashFlowDoc(current_data.value) ? current_data.value : null,
)
const swotDoc = computed(() => (isSwotDoc(current_data.value) ? current_data.value : null))
const leanCanvasDoc = computed(() => (isLeanCanvasDoc(current_data.value) ? current_data.value : null))
const valuePropositionDoc = computed(() =>
  isValuePropositionDoc(current_data.value) ? current_data.value : null,
)
const okrDoc = computed(() => (isOkrDoc(current_data.value) ? current_data.value : null))
const stakeholderDoc = computed(() => (isStakeholderDoc(current_data.value) ? current_data.value : null))
const pdcaDoc = computed(() => (isPdcaDoc(current_data.value) ? current_data.value : null))
const fiveForcesDoc = computed(() => (isFiveForcesDoc(current_data.value) ? current_data.value : null))
const incomeStatementDoc = computed(() =>
  isIncomeStatementDoc(current_data.value) ? current_data.value : null,
)
const pestleDoc = computed(() => (isPestleDoc(current_data.value) ? current_data.value : null))
const ansoffDoc = computed(() => (isAnsoffDoc(current_data.value) ? current_data.value : null))
const empathyDoc = computed(() => (isEmpathyDoc(current_data.value) ? current_data.value : null))
const marketingMixDoc = computed(() => (isMarketingMixDoc(current_data.value) ? current_data.value : null))
const bcgDoc = computed(() => (isBcgDoc(current_data.value) ? current_data.value : null))
const scorecardDoc = computed(() => (isScorecardDoc(current_data.value) ? current_data.value : null))
const errcDoc = computed(() => (isErrcDoc(current_data.value) ? current_data.value : null))
const aarrDoc = computed(() => (isAarrDoc(current_data.value) ? current_data.value : null))
const valueChainDoc = computed(() => (isValueChainDoc(current_data.value) ? current_data.value : null))
const sevenSDoc = computed(() => (isSevenSDoc(current_data.value) ? current_data.value : null))
const riceDoc = computed(() => (isRiceDoc(current_data.value) ? current_data.value : null))
const breakEvenDoc = computed(() => (isBreakEvenDoc(current_data.value) ? current_data.value : null))
const journeyDoc = computed(() => (isJourneyDoc(current_data.value) ? current_data.value : null))
const kanoDoc = computed(() => (isKanoDoc(current_data.value) ? current_data.value : null))
const moscowDoc = computed(() => (isMoscowDoc(current_data.value) ? current_data.value : null))
const impactEffortDoc = computed(() => (isImpactEffortDoc(current_data.value) ? current_data.value : null))
const vrioDoc = computed(() => (isVrioDoc(current_data.value) ? current_data.value : null))
const goldenCircleDoc = computed(() => (isGoldenCircleDoc(current_data.value) ? current_data.value : null))
const soarDoc = computed(() => (isSoarDoc(current_data.value) ? current_data.value : null))
const playingToWinDoc = computed(() => (isPlayingToWinDoc(current_data.value) ? current_data.value : null))
const tenCheckDoc = computed(() => (isTenCheckDoc(current_data.value) ? current_data.value : null))
const sceneThreeHighDoc = computed(() => (isSceneThreeHighDoc(current_data.value) ? current_data.value : null))
const aiBoundaryDoc = computed(() => (isAiBoundaryDoc(current_data.value) ? current_data.value : null))
const fdeSheetDoc = computed(() => (isFdeSheetDoc(current_data.value) ? current_data.value : null))
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
        <template v-if="humanAiDoc">
          <DualTriangleHumanAiCanvas :doc="humanAiDoc" />
        </template>
        <template v-else-if="dualDoc">
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
        <template v-else-if="fiveStepDivisionDoc">
          <FiveStepDivisionCanvas :doc="fiveStepDivisionDoc" />
        </template>
        <template v-else-if="fiveStepBasicDoc">
          <FiveStepBasicCanvas :doc="fiveStepBasicDoc" />
        </template>
        <template v-else-if="fiveStepAdvancedDoc">
          <FiveStepAdvancedCanvas :doc="fiveStepAdvancedDoc" />
        </template>
        <template v-else-if="fiveStepProDoc">
          <FiveStepProCanvas :doc="fiveStepProDoc" />
        </template>
        <template v-else-if="fiveStepChallengeDoc">
          <FiveStepChallengeCanvas :doc="fiveStepChallengeDoc" />
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
        <template v-else-if="periodSummaryDoc">
          <PeriodSummaryCanvas :doc="periodSummaryDoc" />
        </template>
        <template v-else-if="deepReviewDoc">
          <DeepReviewCanvas :doc="deepReviewDoc" />
        </template>
        <template v-else-if="pmRetroValueDoc">
          <PmRetroValueCanvas :doc="pmRetroValueDoc" />
        </template>
        <template v-else-if="roiTradeoffDoc">
          <RoiTradeoffCanvas :doc="roiTradeoffDoc" />
        </template>
        <template v-else-if="roiDecisionDoc">
          <RoiDecisionCanvas :doc="roiDecisionDoc" />
        </template>
        <template v-else-if="timeMatrixDoc">
          <TimeMatrixCanvas :doc="timeMatrixDoc" />
        </template>
        <template v-else-if="workStateZonesDoc">
          <WorkStateZonesCanvas :doc="workStateZonesDoc" />
        </template>
        <template v-else-if="onlineOfflineCommDoc">
          <OnlineOfflineCommCanvas :doc="onlineOfflineCommDoc" />
        </template>
        <template v-else-if="unitModelQuadrantDoc">
          <UnitModelQuadrantCanvas :doc="unitModelQuadrantDoc" />
        </template>
        <template v-else-if="pmSensitivity6dDoc">
          <PmSensitivity6dCanvas :doc="pmSensitivity6dDoc" />
        </template>
        <template v-else-if="pmCompetencyDoc">
          <PmCompetencyCanvas :doc="pmCompetencyDoc" />
        </template>
        <template v-else-if="scientificMeeting10pDoc">
          <ScientificMeeting10pCanvas :doc="scientificMeeting10pDoc" />
        </template>
        <template v-else-if="productFeatures5dDoc">
          <ProductFeatures5dCanvas :doc="productFeatures5dDoc" />
        </template>
        <template v-else-if="pmSolutionTriangleDoc">
          <PmSolutionTriangleCanvas :doc="pmSolutionTriangleDoc" />
        </template>
        <template v-else-if="growthAssumptionsDoc">
          <GrowthAssumptionsCanvas :doc="growthAssumptionsDoc" />
        </template>
        <template v-else-if="businessFormulaDoc">
          <BusinessFormulaCanvas :doc="businessFormulaDoc" />
        </template>
        <template v-else-if="abcModelDoc">
          <AbcModelCanvas :doc="abcModelDoc" />
        </template>
        <template v-else-if="businessFormulaPatternsDoc">
          <BusinessFormulaPatternsCanvas :doc="businessFormulaPatternsDoc" />
        </template>
        <template v-else-if="cultivationMountainDoc">
          <CultivationMountainCanvas :doc="cultivationMountainDoc" />
        </template>
        <template v-else-if="hackerFiveStepsDoc">
          <HackerFiveStepsCanvas :doc="hackerFiveStepsDoc" />
        </template>
        <template v-else-if="threeRingBasicsDoc">
          <ThreeRingBasicsCanvas :doc="threeRingBasicsDoc" />
        </template>
        <template v-else-if="leadershipTriangleDoc">
          <LeadershipTriangleCanvas :doc="leadershipTriangleDoc" />
        </template>
        <template v-else-if="contextSixElementsDoc">
          <ContextSixElementsCanvas :doc="contextSixElementsDoc" />
        </template>
        <template v-else-if="projectGanttDoc">
          <ProjectGanttCanvas :doc="projectGanttDoc" />
        </template>
        <template v-else-if="raciMatrixDoc">
          <RaciMatrixCanvas :doc="raciMatrixDoc" />
        </template>
        <template v-else-if="dailyKanbanDoc">
          <DailyKanbanCanvas :doc="dailyKanbanDoc" />
        </template>
        <template v-else-if="businessModelCanvasDoc">
          <BusinessModelCanvas :doc="businessModelCanvasDoc" />
        </template>
        <template v-else-if="cashFlowDoc">
          <CashFlowCanvas :doc="cashFlowDoc" />
        </template>
        <template v-else-if="swotDoc">
          <SwotCanvas :doc="swotDoc" />
        </template>
        <template v-else-if="leanCanvasDoc">
          <LeanCanvas :doc="leanCanvasDoc" />
        </template>
        <template v-else-if="valuePropositionDoc">
          <ValuePropositionCanvas :doc="valuePropositionDoc" />
        </template>
        <template v-else-if="okrDoc">
          <OkrCanvas :doc="okrDoc" />
        </template>
        <template v-else-if="stakeholderDoc">
          <StakeholderCanvas :doc="stakeholderDoc" />
        </template>
        <template v-else-if="pdcaDoc">
          <PdcaCanvas :doc="pdcaDoc" />
        </template>
        <template v-else-if="fiveForcesDoc">
          <FiveForcesCanvas :doc="fiveForcesDoc" />
        </template>
        <template v-else-if="incomeStatementDoc">
          <IncomeStatementCanvas :doc="incomeStatementDoc" />
        </template>
        <template v-else-if="pestleDoc">
          <PestleCanvas :doc="pestleDoc" />
        </template>
        <template v-else-if="ansoffDoc">
          <AnsoffCanvas :doc="ansoffDoc" />
        </template>
        <template v-else-if="empathyDoc">
          <EmpathyCanvas :doc="empathyDoc" />
        </template>
        <template v-else-if="marketingMixDoc">
          <MarketingMixCanvas :doc="marketingMixDoc" />
        </template>
        <template v-else-if="bcgDoc">
          <BcgCanvas :doc="bcgDoc" />
        </template>
        <template v-else-if="scorecardDoc">
          <ScorecardCanvas :doc="scorecardDoc" />
        </template>
        <template v-else-if="errcDoc">
          <ErrcCanvas :doc="errcDoc" />
        </template>
        <template v-else-if="aarrDoc">
          <AarrCanvas :doc="aarrDoc" />
        </template>
        <template v-else-if="valueChainDoc">
          <ValueChainCanvas :doc="valueChainDoc" />
        </template>
        <template v-else-if="sevenSDoc">
          <SevenSCanvas :doc="sevenSDoc" />
        </template>
        <template v-else-if="riceDoc">
          <RiceCanvas :doc="riceDoc" />
        </template>
        <template v-else-if="breakEvenDoc">
          <BreakEvenCanvas :doc="breakEvenDoc" />
        </template>
        <template v-else-if="journeyDoc">
          <JourneyCanvas :doc="journeyDoc" />
        </template>
        <template v-else-if="kanoDoc">
          <KanoCanvas :doc="kanoDoc" />
        </template>
        <template v-else-if="moscowDoc">
          <MoscowCanvas :doc="moscowDoc" />
        </template>
        <template v-else-if="impactEffortDoc">
          <ImpactEffortCanvas :doc="impactEffortDoc" />
        </template>
        <template v-else-if="vrioDoc">
          <VrioCanvas :doc="vrioDoc" />
        </template>
        <template v-else-if="goldenCircleDoc">
          <GoldenCircleCanvas :doc="goldenCircleDoc" />
        </template>
        <template v-else-if="soarDoc">
          <SoarCanvas :doc="soarDoc" />
        </template>
        <template v-else-if="playingToWinDoc">
          <PlayingToWinCanvas :doc="playingToWinDoc" />
        </template>
        <template v-else-if="tenCheckDoc">
          <TenCheckCanvas :doc="tenCheckDoc" />
        </template>
        <template v-else-if="sceneThreeHighDoc">
          <SceneThreeHighCanvas :doc="sceneThreeHighDoc" />
        </template>
        <template v-else-if="aiBoundaryDoc">
          <AiBoundaryCanvas :doc="aiBoundaryDoc" />
        </template>
        <template v-else-if="fdeSheetDoc">
          <FdeSheetCanvas :doc="fdeSheetDoc" />
        </template>
        <template v-else-if="quadrantDoc">
          <BackgroundLayer
            v-if="quadrantDoc.theme?.background"
            :background="quadrantDoc.theme.background"
          />
          <QuadrantGrid :quadrants="quadrantDoc.quadrants" />
          <AxesLayer :axes="quadrantDoc.axes" />
          <MarkersLayer :markers="quadrantDoc.markers" />
        </template>
      </div>
      <div v-else class="empty" role="status">
        <p class="empty-title">画布还没有打开</p>
        <p class="empty-hint">选择一份工作表后，内容会显示在这里。</p>
      </div>
    </div>
  </div>
</template>

<style src="./canvasPolish.css"></style>

<style scoped>
.viewport-shell {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(980px 420px at 18% -10%, rgba(255, 252, 246, 0.7), transparent 58%),
    #e6dfd4;
  padding: 16px;
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
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(62, 48, 28, 0.08);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 18px 42px rgba(62, 48, 28, 0.14);
  transform-origin: center center;
  background: var(--cv-page, #f4f0e8);
}

.empty {
  margin: auto;
  max-width: 280px;
  padding: 28px 24px;
  text-align: center;
  color: var(--cv-muted, #5f6368);
  background: var(--cv-page, #f7f7f7);
  border: 1px solid var(--cv-frame, #ececec);
  border-radius: 12px;
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--cv-ink-strong, #202124);
  letter-spacing: 0.02em;
}

.empty-hint {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
}
</style>
