/** 文档模板：建文档时注入预设 HTML 内容。
 * 纯前端预设，不依赖后端模板表；createDocWithNode 建空文档后调 updateDocument 写入。 */

export type DocTemplate = {
  key: string
  label: string
  icon: string
  html: string
}

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    key: 'blank',
    label: '空白文档',
    icon: '📄',
    html: '',
  },
  {
    key: 'meeting',
    label: '会议纪要',
    icon: '📝',
    html: `<h1>会议纪要</h1><p><strong>日期：</strong></p><p><strong>参会人：</strong></p><h2>议题</h2><ul><li></li></ul><h2>决议</h2><ul><li></li></ul><h2>待办</h2><ul><li></li></ul>`,
  },
  {
    key: 'requirement',
    label: '需求文档',
    icon: '📋',
    html: `<h1>需求文档</h1><h2>背景</h2><p></p><h2>目标</h2><ul><li></li></ul><h2>功能列表</h2><ul><li></li></ul><h2>非功能需求</h2><ul><li></li></ul><h2>里程碑</h2><ul><li></li></ul>`,
  },
  {
    key: 'weekly',
    label: '周报',
    icon: '📅',
    html: `<h1>周报</h1><p><strong>周期：</strong></p><h2>本周完成</h2><ul><li></li></ul><h2>下周计划</h2><ul><li></li></ul><h2>风险与求助</h2><ul><li></li></ul>`,
  },
]
