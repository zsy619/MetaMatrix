import { defineStore } from 'pinia'
import { ref } from 'vue'

const CONFIG_PANEL_KEY = 'metamatrix:config-panel'

function readConfigPanelOpen(): boolean {
  try {
    return localStorage.getItem(CONFIG_PANEL_KEY) === '1'
  } catch {
    return false
  }
}

export const useUiStore = defineStore('ui', () => {
  const configPanelOpen = ref(readConfigPanelOpen())
  const versionDrawerOpen = ref(false)
  const zoom = ref(1)
  const snapEnabled = ref(true)
  const snapThresholdPx = ref(6)

  function toggleConfigPanel() {
    configPanelOpen.value = !configPanelOpen.value
    try {
      localStorage.setItem(CONFIG_PANEL_KEY, configPanelOpen.value ? '1' : '0')
    } catch {
      /* 隐私模式写不进时，这次会话里的开关仍然有效 */
    }
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
