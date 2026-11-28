/**
 * Element Plus 按需出口。
 *
 * 业务代码里脚本侧只用得到 ElMessage / ElMessageBox 两个服务，
 * 但 `import { ElMessage } from 'element-plus'` 会把整库带进首屏
 * （开发态预打包后单个 chunk 约 7MB）。这里改成按组件子路径引入，
 * vite.config.ts 再把裸模块名 'element-plus' 别名到这里，
 * 业务代码一行都不用改。
 */
export { ElMessage } from 'element-plus/es/components/message/index'
export { ElMessageBox } from 'element-plus/es/components/message-box/index'
