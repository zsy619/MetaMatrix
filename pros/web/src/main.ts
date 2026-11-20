import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'katex/dist/katex.min.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/auth.css'
import './styles/canvas-states.css'
import './styles/panel-maximize.css'
import './styles/dialog.css'
import './styles/table-tone.css'
import './styles/radar-flow.css'
import App from './App.vue'
import router from './router'
import { pinia } from './stores'

const app = createApp(App)
// pinia 必须先于 router 挂载：路由守卫里要拿 auth store。
app.use(pinia)
app.use(router)
app.use(ElementPlus)
app.mount('#app')
