import { createRouter, createWebHistory, type NavigationGuard } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { pinia } from '../stores'
import type { Pinia } from 'pinia'

// 给路由 meta 补上类型，这样 to.meta.requiresAuth 不用到处 as boolean。
declare module 'vue-router' {
  interface RouteMeta {
    /** 需要登录才能进入。登录守卫会拦下未登录的访问。 */
    requiresAuth?: boolean
  }
}

const routes = [
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
    // 找回密码：不需要登录（用户正是登不进来才来的）。
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('../views/ResetPasswordView.vue'),
    meta: { scrollable: true },
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('../views/AccountView.vue'),
    meta: { scrollable: true, requiresAuth: true },
  },
  {
    path: '/workspace',
    name: 'workspace',
    component: () => import('../views/WorkspaceView.vue'),
    meta: { scrollable: true },
  },
  {
    // 项目：画布的容器。一个项目下有多张画布。
    path: '/projects',
    name: 'projects',
    component: () => import('../views/ProjectListView.vue'),
    meta: { scrollable: true, requiresAuth: true },
  },
  {
    path: '/projects/:projectId',
    name: 'project-detail',
    component: () => import('../views/ProjectDetailView.vue'),
    meta: { scrollable: true, requiresAuth: true },
  },
  {
    // 分享页：公开入口，靠分享 token 授权，不需要登录态。
    path: '/share/:token',
    name: 'share',
    component: () => import('../views/ShareView.vue'),
    meta: { scrollable: true },
  },
  {
    // 知识库：目录树 + 富文本文档。
    path: '/projects/:projectId/knowledge',
    name: 'knowledge',
    component: () => import('../views/KnowledgeView.vue'),
    meta: { scrollable: false, requiresAuth: true },
  },
  {
    // 知识库：直接打开某篇文档（@ 文档 mention 跳转）。
    path: '/projects/:projectId/knowledge/docs/:documentId',
    name: 'knowledge-doc',
    component: () => import('../views/KnowledgeView.vue'),
    meta: { scrollable: false, requiresAuth: true },
  },
  {
    // 节点画布：富文本节点 + 画布引用节点 + 连线。
    path: '/projects/:projectId/canvas/:canvasId',
    name: 'node-graph',
    component: () => import('../views/NodeGraphView.vue'),
    meta: { scrollable: false, requiresAuth: true },
  },
  {
    path: '/canvas/:templateId',
    name: 'canvas',
    component: () => import('../views/HomeView.vue'),
    meta: { scrollable: false, requiresAuth: true },
  },
]

/**
 * 登录守卫：没登录就不许进需要登录的页面。
 *
 * 为什么放在路由层，而不是在每个视图的 onMounted 里各写一遍：
 * - 入口太多。画布可以从引导页、工作台、搜索命中、页面设置面板、
 *   甚至直接改地址栏进入，共二十多处入口，漏一个就等于没做。
 * - 视图内的检查太晚。组件已经创建、onMounted 已经跑了一半，
 *   用户会先看到画布骨架闪一下，才被弹走。
 * 守卫在路由解析前拦截，这两处问题都不存在。
 *
 * 守卫本身不引入额外的网络请求：登录态从本机 token 判断，
 * 服务端的权威校验交给接口的 401 响应（见 api/http.ts）。
 *
 * @param instance 注入的 pinia 实例。守卫在组件之外运行，没有 setup 上下文，
 *   依赖 pinia 的"当前活跃实例"是隐式的；显式传入更可靠，也让测试能注入桩。
 */
export function createAuthGuard(instance: Pinia = pinia): NavigationGuard {
  return (to) => {
    if (!to.meta.requiresAuth) return true

    const auth = useAuthStore(instance)

    // 会话中途过期时（token 被接口 401 清掉），这里也要拦。
    // 否则用户会停在一个什么都做不了的画布里。
    if (auth.hasUsableSession()) return true

    // 记下用户原本想去哪，登录成功后直接送回去。
    // 登录页会用 safeRedirect 校验这个值，只允许站内路径。
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(createAuthGuard())

export default router
