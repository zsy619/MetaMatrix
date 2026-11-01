import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'guide',
      component: () => import('../views/GuideView.vue'),
      meta: { scrollable: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { scrollable: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { scrollable: true },
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('../views/AccountView.vue'),
      meta: { scrollable: true },
    },
    {
      path: '/workspace',
      name: 'workspace',
      component: () => import('../views/WorkspaceView.vue'),
      meta: { scrollable: true },
    },
    {
      path: '/canvas/:templateId',
      name: 'canvas',
      component: () => import('../views/HomeView.vue'),
      meta: { scrollable: false },
    },
  ],
})

export default router
