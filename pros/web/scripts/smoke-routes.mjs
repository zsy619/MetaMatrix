import fs from 'node:fs'
import { createMemoryHistory, createRouter } from 'vue-router'

const routerSrc = fs.readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8')
const paths = [...routerSrc.matchAll(/path: '([^']+)'/g)].map((match) => match[1])
const required = ['/login', '/workspace', '/canvas/:templateId', '/account']
for (const path of required) {
  if (!paths.includes(path)) {
    console.error(`missing route ${path}`)
    process.exit(1)
  }
}

for (const file of [
  '../src/views/LoginView.vue',
  '../src/views/WorkspaceView.vue',
  '../src/views/HomeView.vue',
  '../src/views/AccountView.vue',
]) {
  const url = new URL(file, import.meta.url)
  if (!fs.existsSync(url)) {
    console.error(`missing view ${file}`)
    process.exit(1)
  }
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/login', name: 'login', component: { template: '<div>login</div>' } },
    { path: '/workspace', name: 'workspace', component: { template: '<div>workspace</div>' } },
    { path: '/canvas/:templateId', name: 'canvas', component: { template: '<div>canvas</div>' } },
  ],
})

await router.push('/login')
if (router.currentRoute.value.name !== 'login') {
  console.error('login route did not open')
  process.exit(1)
}
await router.push('/workspace')
if (router.currentRoute.value.name !== 'workspace') {
  console.error('workspace route did not open')
  process.exit(1)
}
await router.push('/canvas/dual-triangle')
if (router.currentRoute.value.params.templateId !== 'dual-triangle') {
  console.error('canvas route did not open')
  process.exit(1)
}

console.log('smoke ok: login → workspace → canvas')
