import { createApp } from 'vue'
// Element Plus 组件改为按需自动引入（unplugin-vue-components + ElementPlusResolver），
// 这里只保留全量样式表，避免程序化弹层（ElMessage / ElMessageBox）缺样式。
import 'element-plus/dist/index.css'
import 'katex/dist/katex.min.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/enterprise.css'
import './styles/knowledge.telegram.css'
import './styles/auth.css'
import './styles/canvas-states.css'
import './styles/panel-maximize.css'
import './styles/dialog.css'
import './styles/table-tone.css'
import './styles/radar-flow.css'
// 玻璃拟态层必须最后导入：它要覆盖前面几层的表面与悬停样式。
import './styles/glass.css'
// 全局设计规范（Telegram Web K）：最后导入，覆盖玻璃层旧规则
import './styles/telegram.css'
import App from './App.vue'
import router from './router'
import { pinia } from './stores'
// v-loading 指令：整库引入被移除后必须单独注册（ElLoading.install 会注册
// 'loading' 指令并注入 app._context，供 loading service 使用）。
import { ElLoading } from 'element-plus/es/components/loading/index'

const app = createApp(App)
// pinia 必须先于 router 挂载：路由守卫里要拿 auth store。
app.use(pinia)
app.use(ElLoading)
app.use(router)
app.mount('#app')
