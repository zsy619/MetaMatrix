<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ShortcutsDialog from './components/ui/ShortcutsDialog.vue'

const DENSITY_KEY = 'metamatrix:density'
const router = useRouter()
const helpOpen = ref(false)

function applyDensity(mode: 'comfortable' | 'compact') {
  document.documentElement.dataset.density = mode
}

function onKey(event: KeyboardEvent) {
  const target = event.target
  const typing =
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    window.dispatchEvent(new Event('metamatrix:save'))
    return
  }
  if (typing) return
  if (event.key === '?' ) {
    event.preventDefault()
    helpOpen.value = !helpOpen.value
    return
  }
  if (event.key === 'Escape' && helpOpen.value) {
    helpOpen.value = false
    return
  }
  if (event.altKey && event.key === '1') {
    event.preventDefault()
    void router.push({ name: 'guide' })
  }
  if (event.altKey && event.key === '2') {
    event.preventDefault()
    void router.push({ name: 'workspace' })
  }
}

onMounted(() => {
  const saved = localStorage.getItem(DENSITY_KEY)
  applyDensity(saved === 'compact' ? 'compact' : 'comfortable')
  window.addEventListener('keydown', onKey)
  window.addEventListener('metamatrix:density', (event) => {
    const mode = (event as CustomEvent<string>).detail === 'compact' ? 'compact' : 'comfortable'
    applyDensity(mode)
    localStorage.setItem(DENSITY_KEY, mode)
  })
})

onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <router-view />
  <ShortcutsDialog :open="helpOpen" @close="helpOpen = false" />
</template>
