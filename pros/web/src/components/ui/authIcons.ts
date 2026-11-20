/**
 * 登录 / 注册页用到的内联 SVG 图标。
 *
 * 为什么内联 SVG 而不是用 @element-plus/icons-vue：
 * 1. 整个应用只用到四五个图标，为它们引入整套图标库不划算；
 * 2. 内联 SVG 可以直接用 currentColor 跟随主题色，不用额外适配配色；
 * 3. 路径数据写死在这里，体积只有几百字节，且不会被打包器摇树误删。
 *
 * 统一规范：
 * - 24x24 视口，1.7 描边宽度，圆头圆角，视觉重量和 14px 正文匹配；
 * - 用 currentColor 填色，具体的颜色交给外层 CSS 控制。
 */

/** 邮箱：信封轮廓。 */
export const ICON_MAIL = `<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.6 6.8 12 13l8.4-6.2"/>`

/** 锁：闭锁状态，锁体加锁梁。 */
export const ICON_LOCK = `<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>`

/** 眼睛：明文可见（显示密码）。 */
export const ICON_EYE = `<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3.1"/>`

/** 眼睛加斜杠：明文隐藏（隐藏密码）。 */
export const ICON_EYE_OFF = `<path d="M9.9 5.2A9.6 9.6 0 0 1 12 5.1c6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-2.7 3.6M6.3 7A17 17 0 0 0 2.5 11.3S6 17.5 12 17.5a9.3 9.3 0 0 0 3.3-.6"/><path d="M10 9.9a3.1 3.1 0 0 0 4.2 4.3"/><path d="M3.5 3.5 20.5 20.5"/>`

/** 用户：显示名 / 账号。 */
export const ICON_USER = `<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.4 7.4 0 0 1 14.4 0"/>`

/**
 * 把路径数据渲染成 SVG 字符串。
 * 只在渲染期调用一次（作为 v-html 注入），不是用户输入，不存在注入风险。
 */
export function authIcon(paths: string, size = 18): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}
