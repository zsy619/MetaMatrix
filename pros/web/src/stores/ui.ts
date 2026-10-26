import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const configPanelOpen = ref(true)
  const versionDrawerOpen = ref(false)
  const zoom = ref(1)
  const snapEnabled = ref(true)
  const snapThresholdPx = ref(6)

  function toggleConfigPanel() {
    configPanelOpen.value = !configPanelOpen.value
  }

  function toggleVersionDrawer() {
    versionDrawerOpen.value = !versionDrawerOpen.value
  }

  function setZoom(value: number) {
    zoom.value = Math.min(2, Math.max(0.4, value))
  }

  function zoomIn() {
    setZoom(zoom.value + 0.1)
  }

  function zoomOut() {
    setZoom(zoom.value - 0.1)
  }

  function toggleSnap() {
    snapEnabled.value = !snapEnabled.value
  }

  return {
    configPanelOpen,
    versionDrawerOpen,
    zoom,
    snapEnabled,
    snapThresholdPx,
    toggleConfigPanel,
    toggleVersionDrawer,
    setZoom,
    zoomIn,
    zoomOut,
    toggleSnap,
  }
})
